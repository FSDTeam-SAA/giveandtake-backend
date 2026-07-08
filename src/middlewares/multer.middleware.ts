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
    console.log("Uploading file with mimetype:", file.mimetype);

    const extname = path.extname(file.originalname).toLowerCase();
    const mimetypeAllowed = ALLOWED_MIME_TYPES.has(file.mimetype);
    const extensionAllowed = ALLOWED_EXTENSIONS.has(extname);

    if (mimetypeAllowed || extensionAllowed) {
      return cb(null, true);
    }

    cb(
      new Error(
        `File type not allowed. Supported types: jpeg, jpg, png, webp, mp4, mov, avi, xlsx`
      )
    );
  },
});

export const resumeUpload = upload.fields([
  { name: "videoFile", maxCount: 1 },
  { name: "photo", maxCount: 1 },
]);

export const resumeFileUpload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // ✅ Also increase for resume files
  },
}).array("resumes", 5);





