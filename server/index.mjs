/**
 * Open-source local service.
 * No accounts, no hosted model key, no billing, no cloud voice, no retrieval gateway.
 * The app talks to the user's own API from the device.
 */
import express from "express";

const app = express();
const port = Number(process.env.PORT || 8787);

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "nyra-open", auth: false, hosted: false });
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "removed",
    path: req.path,
  });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`nyra-open listening on http://127.0.0.1:${port}`);
});
