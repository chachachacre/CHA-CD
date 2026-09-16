import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Ensure uploads directory exists in public/uploads
  const publicDir = path.join(process.cwd(), "public");
  const uploadsDir = path.join(publicDir, "uploads");

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Configure Multer storage
  const storageConfig = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9._-]/g, "_");
      const uniqueName = `${Date.now()}_${baseName}${ext}`;
      cb(null, uniqueName);
    },
  });

  const upload = multer({
    storage: storageConfig,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit for high-res videos
  });

  // Serve static uploads
  app.use("/uploads", express.static(uploadsDir));
  app.use(express.static(publicDir));

  // Middleware
  app.use(express.json({ limit: "100mb" }));
  app.use(express.urlencoded({ extended: true, limit: "100mb" }));

  // API Route: File Upload (Videos, Thumbnails, PDFs, etc.)
  app.post("/api/upload", upload.single("file"), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const fileUrl = `/uploads/${req.file.filename}`;
      console.log(`[Upload API] File uploaded successfully: ${fileUrl} (${req.file.size} bytes)`);

      return res.json({
        success: true,
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
      });
    } catch (error) {
      console.error("[Upload API] Server upload error:", error);
      return res.status(500).json({ error: "Failed to upload file to server" });
    }
  });

  // API Route: Force Download with correct attachment header and remote proxy capability
  app.get("/api/download", async (req, res) => {
    try {
      let fileParam = ((req.query.file || req.query.url) as string) || "";
      let downloadName = (req.query.name as string) || "CHA_CD_Rate_Card.pdf";
      const isInline = req.query.inline === "true";

      if (!fileParam) {
        return res.status(400).json({ error: "Missing file parameter" });
      }

      // If fileParam has been doubly URI encoded (e.g. %252F instead of %2F), decode it back
      if (fileParam.includes("%25")) {
        try {
          fileParam = decodeURIComponent(fileParam);
        } catch {
          // ignore
        }
      }

      // Strip any browser extension prefixes (e.g. Adobe Acrobat chrome-extension://)
      if (fileParam.includes("chrome-extension://")) {
        fileParam = fileParam.replace(/^chrome-extension:\/\/[^/]+\//, "");
      }

      // Ensure downloadName has .pdf extension if it looks like a PDF
      if (fileParam.includes(".pdf") && !downloadName.toLowerCase().endsWith(".pdf")) {
        downloadName = `${downloadName}.pdf`;
      }

      const encodedFilename = encodeURIComponent(downloadName).replace(/['()]/g, escape).replace(/\*/g, "%2A");
      const asciiFallback = downloadName.replace(/[^\x20-\x7E]/g, "_");
      const dispositionType = isInline ? "inline" : "attachment";

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, Content-Length");

      // 1. Remote URL (e.g. Firebase Storage, Cloudinary, AWS S3)
      if (fileParam.startsWith("http://") || fileParam.startsWith("https://")) {
        console.log(`[Download API] Proxying remote file download: ${fileParam} as "${downloadName}" (inline: ${isInline})`);
        const remoteRes = await fetch(fileParam);
        if (!remoteRes.ok) {
          console.error(`[Download API] Failed to fetch remote file: ${remoteRes.status} ${remoteRes.statusText}`);
          return res.status(remoteRes.status).send(`Failed to fetch remote file: ${remoteRes.statusText}`);
        }

        const contentType = remoteRes.headers.get("content-type") || "application/pdf";
        res.setHeader("Content-Type", contentType);
        res.setHeader(
          "Content-Disposition",
          `${dispositionType}; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`
        );

        const arrayBuffer = await remoteRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        res.setHeader("Content-Length", buffer.length);
        return res.end(buffer);
      }

      // 2. Local uploads directory
      const safeFilename = path.basename(fileParam.replace(/^\/uploads\//, ""));
      const filePath = path.join(uploadsDir, safeFilename);

      if (fs.existsSync(filePath)) {
        console.log(`[Download API] Serving local file: ${filePath} as "${downloadName}"`);
        const stat = fs.statSync(filePath);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Length", stat.size);
        res.setHeader(
          "Content-Disposition",
          `${dispositionType}; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`
        );
        const fileStream = fs.createReadStream(filePath);
        return fileStream.pipe(res);
      } else {
        console.warn(`[Download API] Local file not found: ${filePath}`);
        return res.status(404).send("File not found on server");
      }
    } catch (err) {
      console.error("[Download API] Error:", err);
      return res.status(500).send("Server download failed");
    }
  });

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Vite dev middleware for development mode
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Server startup error:", err);
});
