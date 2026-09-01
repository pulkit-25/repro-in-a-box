import { app } from "./app.js";

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => console.log(`BuggyBoard API on http://localhost:${PORT}`));
