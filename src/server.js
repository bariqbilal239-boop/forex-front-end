// Local development server. On Vercel, api/index.js is used instead.
import app from "./app.js";

const PORT = Number(process.env.PORT) || 5173;

app.listen(PORT, () => console.log(`Aurum API + admin running: http://localhost:${PORT}/admin.html`));
