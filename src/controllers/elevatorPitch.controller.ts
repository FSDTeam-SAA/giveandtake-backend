
// controllers/elevatorPitch.controller.ts
import path from "path";
import fs from "fs";
import { Request, Response } from "express";
import { ElevatorPitch } from "../models/elevatorPitch.model";
import catchAsync from "../utils/catchAsync";
import AppError from "../errors/AppError";
import httpStatus from "http-status";
import { getVideoMetadata, processVideoHLS } from "../services/ffmpeg.service";
import { paymentInfo } from "../models/paymentInfo.model";
import axios from "axios";
import { validateElevatorPitchAccess } from "../helper/validateElevatorPitchAccess";
import { User } from "../models/user.model";
import {
  uploadHLSFilesToS3,
  getSignedS3Url,
  deleteFromS3,
} from "../services/s3.service";
import { createNotification } from "../sockets/notification.service";

/*************************************
 * ADD RESUME VIDEO (ELEVATOR PITCH) *
 *************************************/
export const createResume = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.query;

  if (!userId || typeof userId !== "string") {
    throw new AppError(httpStatus.BAD_REQUEST, "User ID is required");
  }

  // @ts-ignore
  if (!req.files?.videoFile || !Array.isArray(req.files.videoFile)) {
    throw new AppError(httpStatus.BAD_REQUEST, "No video file uploaded");
  }

  // @ts-ignore
  const videoFile = req.files.videoFile[0];
  const tempPath = videoFile.path;

  if (!fs.existsSync(tempPath)) {
    throw new AppError(httpStatus.NOT_FOUND, "Uploaded file not found");
  }

  const existingPitch = await ElevatorPitch.findOne({ userId });
  if (existingPitch) {
    fs.unlinkSync(tempPath);
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You already have an elevator pitch"
    );
  }

  const metadata = await getVideoMetadata(tempPath);

  // VALIDATE UPLOAD PERMISSION
  await validateElevatorPitchAccess(userId, metadata.duration);

  if (metadata.duration > 60 ) {
    // const hasActivePlan = await paymentInfo.findOne({
    //   userId,
    //   paymentStatus: "complete",
    // });
    // if (!hasActivePlan) {
    //   fs.unlinkSync(tempPath);
      throw new AppError(
        httpStatus.PAYMENT_REQUIRED,
        "Video duration exceeds 60 seconds."
      );
    // }
  }

  // ✅ Process video to HLS
  const hlsDir = path.join(__dirname, `../../temp/hls/${userId}`);
  fs.mkdirSync(hlsDir, { recursive: true });

  // @ts-ignore
  await processVideoHLS(tempPath, hlsDir, userId);
  fs.unlinkSync(tempPath);

  // ✅ Upload HLS files to AWS S3
  const s3Folder = `elevator_pitches/${userId}/hls`;
  const uploadedFiles = await uploadHLSFilesToS3(hlsDir, s3Folder);

  // ✅ Extract S3 URLs
  const hlsUrl = uploadedFiles["master.m3u8"] || "";
  const encryptionKeyUrl = uploadedFiles["encryption.key"] || "";

  // ✅ Clean up HLS temp directory
  fs.rmSync(hlsDir, { recursive: true, force: true });

  // ✅ Save to DB with S3 URLs
  const newPitch = await ElevatorPitch.create({
    userId,
    video: {
      url: null,
      hlsUrl,
      encryptionKeyUrl,
      localPaths: {
        original: null,
        hls: hlsUrl,
        key: encryptionKeyUrl,
      },
    },
  });

  res.status(httpStatus.CREATED).json({
    success: true,
    message: "Elevator pitch created and uploaded to AWS S3 successfully",
    data: {
      id: newPitch._id,
      hlsUrl,
      encryptionKeyUrl,
    },
  });
});

export const deleteResume = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.query;

  const pitch = await ElevatorPitch.findOne({ userId });
  if (!pitch) {
    throw new AppError(httpStatus.NOT_FOUND, "Elevator pitch not found");
  }

  // Clean up S3 files
  if (pitch.video.hlsUrl) {
    try {
      const hlsUrl = pitch.video.hlsUrl;
      const s3Key = hlsUrl.replace(
        `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/`,
        ""
      );
      const keyFolder = path.dirname(s3Key);

      // Delete all files in the HLS folder
      await deleteFromS3(s3Key); // master playlist
      await deleteFromS3(`${keyFolder}/encryption.key`);

      // Delete .ts segments (you might want to list and delete all segments)
      const baseKey = s3Key.replace(/[^/]+$/, "");
      // Note: For production, you'd want to list all objects with prefix and delete them
    } catch (error) {
      console.error("Error deleting S3 files:", error);
    }
  }

  await ElevatorPitch.deleteOne({ _id: pitch._id });
  if(req.user?.role === "admin"){
      // ✅ also send notification in-app
      let notification = await createNotification({
        to: userId as any,
        message: `Admin has removed your elevator pitch video please upload again`,
        type: "Update elevator pitch",
        id: pitch._id as any,
      });
    }

  res.status(httpStatus.OK).json({
    success: true,
    message: "Elevator pitch deleted successfully",
  });
});

/*************************
 * STREAM ELEVATOR PITCH *
 *************************/
export const streamElevatorPitch = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const pitch = await ElevatorPitch.findById(id);
    if (!pitch || !pitch.video?.hlsUrl) {
      throw new AppError(httpStatus.NOT_FOUND, "Elevator pitch not found");
    }

    const hlsUrl = pitch.video.hlsUrl;

    // For S3, we need to generate a signed URL for private content
    // If your S3 bucket is public, you can use the direct URL
    const isPrivateBucket = process.env.AWS_BUCKET_VISIBILITY === "private";

    if (isPrivateBucket) {
      const s3Key = hlsUrl.replace(
        `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/`,
        ""
      );
      const signedUrl = await getSignedS3Url(s3Key, 3600); // 1 hour expiry

      const playlistRes = await axios.get(signedUrl);
      let playlistContent = playlistRes.data as string;

      // Rewrite .ts segment lines to use our secure proxy endpoint
      const rewriteAssetLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          return line;
        }
        if (/\.(ts|m3u8)$/i.test(trimmed)) {
          return `/api/v1/elevator-pitch/stream/${pitch.userId.toString()}/${trimmed}`;
        }
        return line;
      };

      playlistContent = playlistContent
        .split("\n")
        .map(rewriteAssetLine)
        .join("\n");

      res.set({
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-cache",
      });

      res.send(playlistContent);
    } else {
      // Public bucket - redirect to S3 URL
      res.redirect(hlsUrl);
    }
  }
);

/********************
 * SECURE STREAMING *
 ********************/
export const secureStream = catchAsync(async (req: Request, res: Response) => {
  const { userId, segment } = req.params;

  // Find pitch by userId
  const pitch = await ElevatorPitch.findOne({ userId });
  if (!pitch || !pitch.video?.hlsUrl) {
    throw new AppError(httpStatus.NOT_FOUND, "Elevator pitch not found");
  }

  // Derive base S3 key from the stored master playlist URL
  const hlsUrl = pitch.video.hlsUrl;
  const baseS3Key = hlsUrl.replace(
    `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/`,
    ""
  );
  const sanitizedSegment = segment.replace(/\\/g, "/");
  if (sanitizedSegment.includes("..")) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid segment reference");
  }
  const baseDirectory = baseS3Key.replace(/[^/]+$/, "");
  const segmentS3Key = `${baseDirectory}${sanitizedSegment}`;
  const isPlaylist = sanitizedSegment.toLowerCase().endsWith(".m3u8");

  try {
    // Generate signed URL for the segment
    const signedSegmentUrl = await getSignedS3Url(segmentS3Key, 3600);
    const response = await axios.get(signedSegmentUrl, {
      responseType: "stream",
    });

    res.set({
      "Content-Type": isPlaylist
        ? "application/vnd.apple.mpegurl"
        : "video/mp2t",
      "Cache-Control": "no-cache",
    });

    response.data.pipe(res);
  } catch (err) {
    throw new AppError(httpStatus.NOT_FOUND, "Segment not found in S3");
  }
});

/*********************
 * GET ENCRYPTED KEY *
 *********************/
export const getEncryptionKey = catchAsync(
  async (req: Request, res: Response) => {
    const { userId, key } = req.params;

    const pitch = await ElevatorPitch.findOne({ userId });
    if (!pitch || !pitch.video?.encryptionKeyUrl) {
      throw new AppError(httpStatus.NOT_FOUND, "Encryption key not found");
    }

    // Check that requested file matches the expected key filename
    if (!pitch.video.encryptionKeyUrl.includes(key)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid key name requested");
    }

    try {
      const encryptionKeyUrl = pitch.video.encryptionKeyUrl;
      const s3Key = encryptionKeyUrl.replace(
        `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/`,
        ""
      );

      const signedKeyUrl = await getSignedS3Url(s3Key, 3600);
      const keyResponse = await axios.get(signedKeyUrl, {
        responseType: "arraybuffer",
      });

      res.set({
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
      });

      res.send(Buffer.from(keyResponse.data));
    } catch (err) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        "Failed to fetch encryption key from S3"
      );
    }
  }
);

/**********************
 * ALL ELEVATOR PITCH *
 **********************/
export const getAllElevatorPitches = catchAsync(
  async (req: Request, res: Response) => {
    const { type } = req.query;

    if (!type || typeof type !== "string") {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Query param "type" is required'
      );
    }

    const allowedRoles = ["candidate", "recruiter", "company"];
    if (!allowedRoles.includes(type)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid user type");
    }

    // Step 1: Get users with the requested role
    const users = await User.find({ role: type }, "_id name email");
    const userIds = users.map((u) => u._id);

    // Step 2: Get Elevator Pitches of those users
    const pitches = await ElevatorPitch.find({
      userId: { $in: userIds },
    }).populate("userId", "name email role");

    res.status(httpStatus.OK).json({
      success: true,
      total: pitches.length,
      data: pitches,
    });
  }
);
