import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { connectDB } from "@/lib/db";
import Payment from "@/modules/payment";
import { verifyAccessToken } from "@/lib/jwt";

// Helper to get token from request
function getToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
}

// Helper to verify user from token
async function verifyUserToken(req: NextRequest) {
  const token = getToken(req);
  if (!token) throw new Error("No token provided");
  return verifyAccessToken(token);
}

// Initialize Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY environment variable is not set");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-12-15.clover",
});

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const decoded = await verifyUserToken(req);
    const userId = decoded.userId;

    const body: any = await req.json();

    // Extract payment details
    const {
      paymentId,
      paymentMethod,
      cardNumber,
      expiryDate, // "MM/YY" or "MMYY"
      cvv,
      card // Optional nested object
    } = body;

    console.log("💳 Processing payment for user:", userId);
    console.log("   - Payment ID:", paymentId);
    console.log("   - Method:", paymentMethod);

    if (!paymentId) {
      return NextResponse.json({ error: "Payment ID is required" }, { status: 400 });
    }

    // 1. Fetch the Payment record from DB to get the amount
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return NextResponse.json({ error: "Payment record not found" }, { status: 404 });
    }

    if (payment.status === 'paid') {
      return NextResponse.json({
        success: true,
        message: "Payment already paid",
        data: payment
      }, { status: 200 });
    }

    const amount = payment.amount;
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid payment amount" }, { status: 400 });
    }

    // 2. Process with Stripe if method is 'stripe'
    let transactionId = "TXN-" + Date.now(); // Fallback for testing/non-stripe

    if (paymentMethod === 'stripe') {
      // Parse expiry
      let expMonth, expYear;
      // Check both root level and nested card object
      const nNumber = cardNumber || card?.number;
      const nExpiry = expiryDate || card?.expiryDate || card?.expiry;
      const nCvc = cvv || card?.cvv || card?.cvc;

      if (nExpiry && nExpiry.includes('/')) {
        [expMonth, expYear] = nExpiry.split('/');
      } else if (card?.exp_month && card?.exp_year) {
        expMonth = card.exp_month;
        expYear = card.exp_year;
      }

      if (!nNumber || !expMonth || !expYear || !nCvc) {
        console.error("Missing card details:", { nNumber: !!nNumber, expMonth, expYear, nCvc: !!nCvc });
        return NextResponse.json({ error: "Incomplete card details" }, { status: 400 });
      }

      try {
        // Create a PaymentIntent
        // Note: Sending raw card data like this requires PCI compliance SAQ D.
        // For a hackathon/demo, using payment_method_data with confirm: true is the way to do it server-side without a frontend token.

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(amount * 100), // USD cents
          currency: 'usd',
          payment_method_data: {
            type: 'card' as const,
            card: {
              number: nNumber.toString().replace(/\s/g, ''),
              exp_month: parseInt(expMonth),
              exp_year: parseInt(expYear.length === 2 ? '20' + expYear : expYear),
              cvc: nCvc.toString(),
            },
          } as any, // Type assertion needed for raw card data
          confirm: true,
          description: `League Fee: ${paymentId}`,
          metadata: {
            paymentId: paymentId,
            userId: userId,
            leagueId: payment.leagueId.toString()
          },
          automatic_payment_methods: {
            enabled: true,
            allow_redirects: 'never'
          }
        });

        if (paymentIntent.status === 'succeeded') {
          transactionId = paymentIntent.id;
        } else {
          return NextResponse.json({
            success: false,
            error: `Payment failed with status: ${paymentIntent.status}`
          }, { status: 400 });
        }

      } catch (stripeError: any) {
        console.error("Stripe Error:", stripeError);
        return NextResponse.json({
          success: false,
          error: stripeError.message || "Stripe processing failed",
          errorType: stripeError.type
        }, { status: 400 });
      }
    }

    // 3. Update Payment Record
    payment.status = "paid";
    payment.paymentMethod = paymentMethod;
    payment.transactionId = transactionId;
    payment.paidAt = new Date();

    await payment.save();

    // Populate for response
    await payment.populate([
      { path: "userId", select: "firstName lastName email role" },
      { path: "leagueId", select: "leagueName logo format startDate endDate status" }
    ]);

    return NextResponse.json({
      success: true,
      message: "Payment processed successfully",
      data: payment
    }, { status: 200 });

  } catch (error: any) {
    console.error("Error in process payment:", error);
    if (error.message === "No token provided" || error.message === "Invalid token") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || "Failed to process payment" }, { status: 500 });
  }
}
