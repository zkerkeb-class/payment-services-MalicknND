require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");

// Middleware CORS en premier
app.use(cors());

// Configuration pour l'API de crédits
const CREDITS_API_URL =
  process.env.CREDITS_API_URL || "http://localhost:9002/api/credits";

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

        // Appeler l'API de crédits pour ajouter les crédits
        try {
          const response = await axios.post(`${CREDITS_API_URL}/add`, {
            userId,
            amount: parseInt(credits),
          });

          if (response.data.success) {
            console.log(
              `✅ Credits added for user ${userId}: ${credits} credits (total: ${response.data.data.totalCredits})`
            );
          } else {
            console.error("❌ Failed to add credits:", response.data.error);
          }
        } catch (apiError) {
          console.error("❌ Error calling credits API:", apiError.message);
        }
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

// Routes pour la gestion des crédits (proxy vers le service BDD)
app.get("/api/credits/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required",
      });
    }

    const response = await axios.get(`${CREDITS_API_URL}/${userId}`);
    res.json(response.data);
  } catch (error) {
    console.error("❌ Error getting credits:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to get credits",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

app.post("/api/credits/use", async (req, res) => {
  try {
    const { userId, amount = 1 } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required",
      });
    }

    const response = await axios.post(`${CREDITS_API_URL}/use`, {
      userId,
      amount,
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      // L'API a retourné une erreur
      res.status(error.response.status).json(error.response.data);
    } else {
      console.error("❌ Error using credits:", error.message);
      res.status(500).json({
        success: false,
        error: "Failed to use credits",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
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
