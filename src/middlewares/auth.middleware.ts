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
    if (user.deactivate) {
      throw new AppError(401, "Account is deactivated");
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

/**
 * Populates req.user when a valid Bearer token is present, but never rejects:
 * missing or invalid token simply proceeds as an anonymous request. Used on
 * routes that are public for some resources and gated for others (e.g. pitch
 * streaming — public for company/recruiter, gated for candidates).
 */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return next();

  try {
    const decoded = (await jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET!
    )) as JwtPayload;
    const user = await User.findById(decoded._id);
    if (
      user &&
      !user.deactivate &&
      (await User.isOTPVerified(user._id.toString()))
    ) {
      req.user = user;
    }
  } catch {
    // ignore — treat as anonymous
  }
  next();
};

export const isAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user?.role !== "admin" && req.user?.role !== 'super-admin') {
    console.log(req.user?.role);
    throw new AppError(403, "Access denied. You are not an admin.");
  }
  next();
};

export const isRicruiter = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'ricruiter') {
    throw new AppError(403, 'Access denied. You are not an ricruiter.')
  }
  next();
};
