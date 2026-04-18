import express from "express";

import app from "./dist/server/index.js";

// Vercel's Express framework detector looks for an explicit express import
// in the top-level entrypoint file.
void express;

export default app;
