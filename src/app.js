require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");

//
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(cors());

app.get("/", (req, res) => {
  res.send("Hello World");
});

app.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.headers["stripe-signature"];

    // Verify the webhook signature
    try {
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      // Handle the event
      switch (event.type) {
        case "payment_intent.succeeded":
          const paymentIntent = event.data.object;
          console.log(paymentIntent);
          console.log("PaymentIntent was successful!");

          const { userId } = paymentIntent.metadata;
          console.log(userId);

          // TODO: Update the user's subscription status
          break;
        default:
          console.log(`Unhandled event type ${event.type}`);
      }
      res.send({ received: true });
    } catch (err) {
      console.log(err);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);
// toujours le mettre après stripe et avant le paiement
app.use(express.json());

app.post("/payment", async (req, res) => {
  const { userId } = req.body;
  const stripeResponse = await stripe.checkout.sessions.create({
    success_url: "https://example.com/success",
    line_items: [
      {
        price: "price_1ReZFj017BRyzAliqGz2Hbo0",
        quantity: 1,
      },
    ],
    mode: "payment",
    payment_intent_data: {
      metadata: {
        userId,
      },
    },
  });
  console.log(stripeResponse);
  const url = stripeResponse.url;
  res.json({ url });
});

app.listen(9001, () => {
  console.log("Server is running on port 9001");
});

// stripe listen --forward-to localhost:9001/stripe/webhook
