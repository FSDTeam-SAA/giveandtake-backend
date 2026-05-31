import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import httpStatus from "http-status";
import AppError from "../errors/AppError";
import { User } from "../models/user.model";

export const protect = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1];
  // console.log(req.headers)
  if (!token) throw new AppError(httpStatus.NOT_FOUND, "Token not found");
  

  try {
    const decoded = await jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as JwtPayload;
    const user = await User.findById(decoded._id)
    if (!user) {
      throw new AppError(401, "Invalid token");
    }
    // H2: reject access tokens issued before the password was last changed
    // (password change / logout revokes all previously issued tokens).
    if (
      user.passwordChangedAt &&
      typeof decoded.iat === "number" &&
      User.isJWTIssuedBeforePasswordChanged(user.passwordChangedAt, decoded.iat)
    ) {
      throw new AppError(401, "Session expired. Please sign in again.");
    }
    const verified = await User.isOTPVerified(user._id.toString());
    if (!verified) {
      throw new AppError(httpStatus.FORBIDDEN, "Email not verified");
    }
    req.user = user;
    next();
  } catch (err) {
    throw new AppError(401, "Invalid token");
  }
};

export const isAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user?.role !== "admin" && req.user?.role !== 'super-admin') {
    throw new AppError(403, "Access denied. You are not an admin.");
  }
  next();
};

export const isRicruiter = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'recruiter' && req.user?.role !== 'company') {
    throw new AppError(403, 'Access denied. You are not a recruiter.')
  }
  next();
};
