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

// ✅ INCREASE FILE SIZE LIMIT for videos
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // ✅ Increased to 100MB for videos
  },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|mp4|mov|avi|xlsx/;
    console.log("Uploading file with mimetype:", file.mimetype);

    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    // if (mimetype && extname) {
      return cb(null, true);
    // }

    // ✅ Better error message
    cb(
      new Error(
        `File type not allowed. Supported types: jpeg, jpg, png, mp4, mov, avi, xlsx`
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
