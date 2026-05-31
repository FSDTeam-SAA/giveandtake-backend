import { Request } from "express";
import httpStatus from "http-status";
import AppError from "../errors/AppError";

/**
 * Roles that bypass per-resource ownership checks.
 */
export const isPrivilegedRole = (role?: string): boolean =>
  role === "admin" || role === "super-admin";

/**
 * Normalise an id-like value (ObjectId | string | populated doc) to a string
 * suitable for comparison. Returns "" for nullish values.
 */
export const idToString = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const obj = value as {
      _id?: unknown;
      toHexString?: () => string;
      toString?: () => string;
    };
    // Mongoose/BSON ObjectId: resolve directly. IMPORTANT: an ObjectId's `_id`
    // getter returns the ObjectId itself, so we must never recurse into `_id`
    // for an ObjectId — handle it here first to avoid infinite recursion.
    if (typeof obj.toHexString === "function") return obj.toHexString();
    // Populated document ({ _id, ... }): resolve its _id (guard self-reference).
    if (obj._id !== undefined && obj._id !== value) return idToString(obj._id);
    if (typeof obj.toString === "function") {
      const s = obj.toString();
      if (s && s !== "[object Object]") return s;
    }
  }
  return String(value);
};

/**
 * Assert that the authenticated requester owns the resource (or is an
 * admin/super-admin). Throws 401 if unauthenticated, 403 if not the owner.
 *
 * Use in every controller that mutates or returns a resource keyed by a
 * user id taken from req.params/req.body, instead of trusting that id.
 */
export const assertOwner = (
  req: Request,
  resourceUserId: unknown,
  message = "You are not allowed to access this resource."
): void => {
  const requesterId = idToString(req.user?._id);
  if (!requesterId) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Authentication required");
  }
  if (isPrivilegedRole(req.user?.role)) return;

  const ownerId = idToString(resourceUserId);
  if (!ownerId || requesterId !== ownerId) {
    throw new AppError(httpStatus.FORBIDDEN, message);
  }
};

/**
 * Coerce a client-supplied identifier (e.g. email) to a primitive string so
 * that objects such as {"$ne": null} cannot reach a Mongo query as operators.
 * Returns "" for non-string/empty input.
 */
export const asQueryString = (value: unknown): string =>
  typeof value === "string" ? value : "";
