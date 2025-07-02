require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Middleware CORS en premier
app.use(cors());

// ⚠️ IMPORTANT: Webhook AVANT express.json() pour recevoir le raw body
app.post(
  "/api/webhook/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    try {
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const { userId, creditPackage, credits } = session.metadata;

        // TODO: Remplacer par une vraie base de données
        const currentCredits = userCredits.get(userId) || 0;
        const newCredits = currentCredits + parseInt(credits);
        userCredits.set(userId, newCredits);

        console.log(
          `✅ Credits added for user ${userId}: ${credits} credits (total: ${newCredits})`
        );
      }

      res.json({ received: true });
    } catch (err) {
      console.error("❌ Webhook error:", err);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);

// JSON middleware APRÈS le webhook
app.use(express.json());

// Configuration pour UN SEUL package pour le moment
const STRIPE_PRICE_100_CREDITS = process.env.STRIPE_PRICE_100_CREDITS;

// Validation que le Price ID est configuré
if (!STRIPE_PRICE_100_CREDITS) {
  console.error(
    "❌ STRIPE_PRICE_100_CREDITS not configured in environment variables"
  );
  process.exit(1);
}

// ⚠️ TEMPORAIRE - Remplacer par une vraie base de données
const userCredits = new Map();

// Routes pour la gestion des crédits
app.get("/api/credits/:userId", (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: "userId is required",
    });
  }

  const credits = userCredits.get(userId) || 0;

  res.json({
    success: true,
    data: {
      userId,
      credits,
      canGenerate: credits > 0,
    },
  });
});

app.post("/api/credits/use", (req, res) => {
  const { userId, amount = 1 } = req.body;

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: "userId is required",
    });
  }

  if (amount < 1) {
    return res.status(400).json({
      success: false,
      error: "Amount must be positive",
    });
  }

  const currentCredits = userCredits.get(userId) || 0;

  if (currentCredits < amount) {
    return res.status(402).json({
      success: false,
      error: "Insufficient credits",
      data: {
        currentCredits,
        requiredCredits: amount,
        canGenerate: false,
      },
    });
  }

  // Déduire les crédits
  const newCredits = currentCredits - amount;
  userCredits.set(userId, newCredits);

  console.log(
    `💳 User ${userId} used ${amount} credits (remaining: ${newCredits})`
  );

  res.json({
    success: true,
    data: {
      userId,
      creditsUsed: amount,
      remainingCredits: newCredits,
      canGenerate: newCredits > 0,
    },
  });
});

// Route pour créer une session de paiement (seulement 100 crédits)
app.post("/api/payment/create-session", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required",
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: STRIPE_PRICE_100_CREDITS,
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${
        process.env.FRONTEND_URL || "http://localhost:3000"
      }/generate?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${
        process.env.FRONTEND_URL || "http://localhost:3000"
      }/pricing?canceled=true`,
      metadata: {
        userId,
        creditPackage: "100_credits",
        credits: "100",
      },
    });

    console.log(`💰 Payment session created for user ${userId}: ${session.id}`);

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
      },
    });
  } catch (error) {
    console.error("❌ Error creating payment session:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create payment session",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Route pour obtenir le package de crédits disponible
app.get("/api/packages", (req, res) => {
  const package = {
    id: "100_credits",
    name: "Crédits x100",
    credits: 100,
    price: 9.99,
    priceId: STRIPE_PRICE_100_CREDITS,
    description: "100 crédits pour générer des images",
    popular: true,
    currency: "EUR",
  };

  res.json({
    success: true,
    data: [package], // Toujours un array pour compatibilité future
  });
});

// Route pour obtenir un package spécifique
app.get("/api/packages/100_credits", (req, res) => {
  const package = {
    id: "100_credits",
    name: "Crédits x100",
    credits: 100,
    price: 9.99,
    priceId: STRIPE_PRICE_100_CREDITS,
    description: "100 crédits pour générer des images",
    popular: true,
    currency: "EUR",
  };

  res.json({
    success: true,
    data: package,
  });
});

// Route de santé
app.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "payment-service",
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
    package: "100_credits_only",
  });
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    details: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Route 404
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

const PORT = process.env.PORT || 9001;
app.listen(PORT, () => {
  console.log(`🚀 Payment service running on port ${PORT}`);
  console.log(`📡 Webhook URL: http://localhost:${PORT}/api/webhook/stripe`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`💳 Package: 100 crédits - 9,99€`);
  console.log(`🆔 Price ID: ${STRIPE_PRICE_100_CREDITS}`);
});
