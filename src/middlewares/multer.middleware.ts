import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure upload directory exists
const uploadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});


const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
  ".mp4",
  ".mov",
  ".avi",
  ".xlsx",
]);


export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 600 * 1024 * 1024, 
  },
  fileFilter: (req, file, cb) => {
    const extname = path.extname(file.originalname).toLowerCase();
    const mimetypeAllowed = ALLOWED_MIME_TYPES.has(file.mimetype);
    const extensionAllowed = ALLOWED_EXTENSIONS.has(extname);

    // M1: require BOTH the mimetype AND the extension to be allowlisted, so a
    // forged mimetype OR a misleading extension alone cannot smuggle a file.
    if (mimetypeAllowed && extensionAllowed) {
      return cb(null, true);
    }

    cb(
      new Error(
        `File type not allowed. Supported types: jpeg, jpg, png, webp, mp4, mov, avi, xlsx`
      )
    );
  },
});

// M1: types that render/execute in a browser and must never be accepted as an
// upload (prevents stored-XSS via files served from /uploads).
const BLOCKED_UPLOAD_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".xhtml",
  ".svg",
  ".xml",
  ".js",
  ".mjs",
]);
const BLOCKED_UPLOAD_MIME_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/xml",
  "application/xml",
  "text/javascript",
  "application/javascript",
]);

export const resumeUpload = upload.fields([
  { name: "videoFile", maxCount: 1 },
  { name: "photo", maxCount: 1 },
]);

export const resumeFileUpload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // ✅ Also increase for resume files
  },
  // M1: previously had NO filter (accepted any type). Block browser-renderable
  // types to close the stored-XSS-via-upload vector without over-restricting.
  fileFilter: (req, file, cb) => {
    const extname = path.extname(file.originalname).toLowerCase();
    if (
      BLOCKED_UPLOAD_EXTENSIONS.has(extname) ||
      BLOCKED_UPLOAD_MIME_TYPES.has(file.mimetype)
    ) {
      return cb(new Error("This file type is not allowed."));
    }
    cb(null, true);
  },
}).array("resumes", 5);





