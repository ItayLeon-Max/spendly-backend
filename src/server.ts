import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import expenseRoutes from "./routes/expense.routes.js";
import userRoutes from "./routes/user.routes.js";
import insightsRoutes from "./routes/insights.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.status(200).send("Spendly API is running 🚀");
});

app.use("/auth", authRoutes);
app.use("/expenses", expenseRoutes);
app.use("/users", userRoutes);
app.use("/insights", insightsRoutes);

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});