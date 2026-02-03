import React, { useState } from "react";

const PaymentPage = ({ userId, paymentId, amount }) => {
  const [cardNumber, setCardNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvc, setCvc] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePay = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus("");

    // 1. Create Payment Intent
    const token = localStorage.getItem("jwt_token"); // Or get from context
    const intentRes = await fetch("/api/payments/create-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ paymentId }),
    });
    const intentData = await intentRes.json();
    if (!intentData.success) {
      setStatus(intentData.error || "Failed to create payment intent");
      setLoading(false);
      return;
    }

    // 2. Process Stripe Payment
    const payRes = await fetch("/api/payments/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        paymentId,
        cardNumber,
        expiryDate,
        cvc,
      }),
    });
    const payData = await payRes.json();
    if (payData.success) {
      setStatus("Payment successful!");
    } else {
      setStatus(payData.error || "Payment failed");
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 400, margin: "auto" }}>
      <h2>Pay with Stripe</h2>
      <form onSubmit={handlePay}>
        <div>
          <label>Card Number</label>
          <input
            type="text"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            placeholder="1234 5678 9012 3456"
            required
          />
        </div>
        <div>
          <label>Expiry Date (MM/YY)</label>
          <input
            type="text"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            placeholder="MM/YY"
            required
          />
        </div>
        <div>
          <label>CVC</label>
          <input
            type="text"
            value={cvc}
            onChange={(e) => setCvc(e.target.value)}
            placeholder="CVC"
            required
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Processing..." : `Pay $${amount}`}
        </button>
      </form>
      {status && <p>{status}</p>}
    </div>
  );
};

export default PaymentPage;
