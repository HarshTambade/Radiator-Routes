import { useState } from "react";
import {
  Wallet,
  ArrowRight,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Copy,
  ExternalLink,
  Smartphone,
  User,
  IndianRupee,
  Info,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── UPI App definitions ───────────────────────────────────────────────────────

interface UPIApp {
  id: string;
  name: string;
  emoji: string;
  color: string;
  scheme: string; // deep-link scheme
  packageAndroid?: string;
}

const UPI_APPS: UPIApp[] = [
  {
    id: "gpay",
    name: "Google Pay",
    emoji: "🔵",
    color: "bg-blue-500/10 text-blue-600 border-blue-500/30",
    scheme: "gpay://upi/pay",
    packageAndroid: "com.google.android.apps.nbu.paisa.user",
  },
  {
    id: "phonepe",
    name: "PhonePe",
    emoji: "🟣",
    color: "bg-purple-500/10 text-purple-600 border-purple-500/30",
    scheme: "phonepe://pay",
    packageAndroid: "com.phonepe.app",
  },
  {
    id: "paytm",
    name: "Paytm",
    emoji: "🔵",
    color: "bg-sky-500/10 text-sky-600 border-sky-500/30",
    scheme: "paytmmp://pay",
    packageAndroid: "net.one97.paytm",
  },
  {
    id: "bhim",
    name: "BHIM",
    emoji: "🟠",
    color: "bg-orange-500/10 text-orange-600 border-orange-500/30",
    scheme: "bhim://upi/pay",
    packageAndroid: "in.org.npci.upiapp",
  },
  {
    id: "amazonpay",
    name: "Amazon Pay",
    emoji: "🟡",
    color: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30",
    scheme: "upi://pay",
    packageAndroid: "in.amazon.mShop.android.shopping",
  },
  {
    id: "cred",
    name: "CRED",
    emoji: "⚫",
    color: "bg-zinc-500/10 text-zinc-600 border-zinc-500/30",
    scheme: "upi://pay",
    packageAndroid: "com.dreamplug.androidapp",
  },
  {
    id: "upi",
    name: "Any UPI App",
    emoji: "🇮🇳",
    color: "bg-green-500/10 text-green-600 border-green-500/30",
    scheme: "upi://pay",
  },
];

// ── UPI deep-link builder ─────────────────────────────────────────────────────

function buildUPILink(
  app: UPIApp,
  toUpiId: string,
  toName: string,
  amount: string,
  note: string,
): string {
  const params = new URLSearchParams({
    pa: toUpiId,
    pn: toName || "Payee",
    am: amount,
    cu: "INR",
    tn: note || "Payment via Radiator Routes",
  });

  // For Google Pay, use a specific intent format
  if (app.id === "gpay") {
    return `tez://upi/pay?${params.toString()}`;
  }

  // PhonePe intent
  if (app.id === "phonepe") {
    return `phonepe://pay?${params.toString()}`;
  }

  // Paytm
  if (app.id === "paytm") {
    return `paytmmp://pay?${params.toString()}`;
  }

  // Generic UPI (works for BHIM, Amazon Pay, CRED, any UPI app)
  return `upi://pay?${params.toString()}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface PersonCardProps {
  label: string;
  role: "sender" | "receiver";
  upiId: string;
  name: string;
  selectedApp: string;
  onUpiIdChange: (v: string) => void;
  onNameChange: (v: string) => void;
  onAppChange: (v: string) => void;
}

function PersonCard({
  label,
  role,
  upiId,
  name,
  selectedApp,
  onUpiIdChange,
  onNameChange,
  onAppChange,
}: PersonCardProps) {
  const app = UPI_APPS.find((a) => a.id === selectedApp) ?? UPI_APPS[6];

  return (
    <div
      className={`rounded-2xl border p-4 space-y-3 ${
        role === "sender"
          ? "bg-blue-500/5 border-blue-500/20"
          : "bg-green-500/5 border-green-500/20"
      }`}
    >
      {/* Label */}
      <div className="flex items-center gap-2">
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
            role === "sender"
              ? "bg-blue-500 text-white"
              : "bg-green-500 text-white"
          }`}
        >
          {role === "sender" ? "A" : "B"}
        </div>
        <div>
          <p className="text-xs font-bold text-card-foreground">{label}</p>
          <p className="text-[10px] text-muted-foreground">
            {role === "sender" ? "Paying party" : "Receiving party"}
          </p>
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="text-[10px] text-muted-foreground mb-1 block">
          Display Name
        </label>
        <div className="relative">
          <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Rahul Sharma"
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-background border border-border text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* UPI ID */}
      <div>
        <label className="text-[10px] text-muted-foreground mb-1 block">
          UPI ID
        </label>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono">
            @
          </span>
          <input
            type="text"
            value={upiId}
            onChange={(e) => onUpiIdChange(e.target.value.trim())}
            placeholder="name@upi or number@bank"
            className="w-full pl-6 pr-3 py-2 rounded-xl bg-background border border-border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        {upiId && !upiId.includes("@") && (
          <p className="text-[10px] text-orange-500 mt-1 flex items-center gap-1">
            <Info className="w-3 h-3" /> UPI ID should contain "@"
          </p>
        )}
        {upiId && upiId.includes("@") && (
          <p className="text-[10px] text-green-600 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Valid UPI format
          </p>
        )}
      </div>

      {/* UPI App selector */}
      <div>
        <label className="text-[10px] text-muted-foreground mb-1.5 block">
          Preferred UPI App
        </label>
        <div className="grid grid-cols-4 gap-1.5">
          {UPI_APPS.map((a) => (
            <button
              key={a.id}
              onClick={() => onAppChange(a.id)}
              className={`flex flex-col items-center gap-0.5 p-1.5 rounded-xl border text-center transition-all ${
                selectedApp === a.id
                  ? `${a.color} border-2 scale-105 shadow-sm`
                  : "border-border bg-secondary/30 hover:bg-secondary/60"
              }`}
              title={a.name}
            >
              <span className="text-base leading-none">{a.emoji}</span>
              <span
                className={`text-[9px] font-medium leading-tight ${
                  selectedApp === a.id ? "" : "text-muted-foreground"
                }`}
              >
                {a.name.split(" ")[0]}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function UPIPayment() {
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState(false);

  // Person A (sender)
  const [aName, setAName] = useState("");
  const [aUpi, setAUpi] = useState("");
  const [aApp, setAApp] = useState("gpay");

  // Person B (receiver)
  const [bName, setBName] = useState("");
  const [bUpi, setBUpi] = useState("");
  const [bApp, setBApp] = useState("gpay");

  // Payment details
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [direction, setDirection] = useState<"AtoB" | "BtoA">("AtoB");
  const [paymentDone, setPaymentDone] = useState(false);

  // Derived
  const senderName = direction === "AtoB" ? aName : bName;
  const senderUpi = direction === "AtoB" ? aUpi : bUpi;
  const senderApp = direction === "AtoB" ? aApp : bApp;
  const receiverName = direction === "AtoB" ? bName : aName;
  const receiverUpi = direction === "AtoB" ? bUpi : aUpi;

  const selectedApp = UPI_APPS.find((a) => a.id === senderApp) ?? UPI_APPS[6];

  const canPay =
    senderUpi.includes("@") &&
    receiverUpi.includes("@") &&
    Number(amount) > 0;

  const handlePay = () => {
    if (!canPay) {
      toast({
        title: "Missing details",
        description:
          "Please fill in both UPI IDs and a valid amount before paying.",
        variant: "destructive",
      });
      return;
    }

    const link = buildUPILink(
      selectedApp,
      receiverUpi,
      receiverName || "Payee",
      parseFloat(amount).toFixed(2),
      note || "Payment via Radiator Routes",
    );

    // Open the UPI deep link
    const anchor = document.createElement("a");
    anchor.href = link;
    anchor.rel = "noopener noreferrer";
    anchor.click();

    setPaymentDone(true);
    toast({
      title: `Opening ${selectedApp.name}...`,
      description: `Paying ₹${amount} to ${receiverName || receiverUpi}`,
    });
  };

  const copyUPILink = async () => {
    if (!canPay) return;
    const link = buildUPILink(
      selectedApp,
      receiverUpi,
      receiverName || "Payee",
      parseFloat(amount).toFixed(2),
      note,
    );
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "UPI link copied!", description: link.slice(0, 60) + "…" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const swapDirection = () => {
    setDirection((d) => (d === "AtoB" ? "BtoA" : "AtoB"));
    setPaymentDone(false);
  };

  const reset = () => {
    setAmount("");
    setNote("");
    setPaymentDone(false);
  };

  const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b border-border cursor-pointer"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-green-500/10">
            <Wallet className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-card-foreground text-sm flex items-center gap-2">
              UPI Payment
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 font-bold border border-green-500/20">
                P2P
              </span>
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Direct peer-to-peer · No payment gateway
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 space-y-4">
          {/* Info banner */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
            <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              This is a{" "}
              <span className="font-semibold text-card-foreground">
                direct UPI deep-link payment
              </span>
              . No data is stored or transmitted through our servers. Your UPI
              app handles the transaction end-to-end.
            </p>
          </div>

          {/* Person A */}
          <PersonCard
            label="Person A"
            role="sender"
            upiId={aUpi}
            name={aName}
            selectedApp={aApp}
            onUpiIdChange={setAUpi}
            onNameChange={setAName}
            onAppChange={setAApp}
          />

          {/* Direction switcher */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary border border-border text-xs font-semibold text-muted-foreground">
                {direction === "AtoB" ? (
                  <>
                    <span className="text-blue-600 font-bold">A</span>
                    <ArrowRight className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-green-600 font-bold">B</span>
                  </>
                ) : (
                  <>
                    <span className="text-green-600 font-bold">B</span>
                    <ArrowRight className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-blue-600 font-bold">A</span>
                  </>
                )}
              </div>
              <button
                onClick={swapDirection}
                className="flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                <ArrowLeftRight className="w-3 h-3" /> Swap direction
              </button>
            </div>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Person B */}
          <PersonCard
            label="Person B"
            role="receiver"
            upiId={bUpi}
            name={bName}
            selectedApp={bApp}
            onUpiIdChange={setBUpi}
            onNameChange={setBName}
            onAppChange={setBApp}
          />

          {/* Payment Details */}
          <div className="space-y-3 p-4 rounded-2xl bg-secondary/30 border border-border">
            <p className="text-xs font-semibold text-card-foreground flex items-center gap-1.5">
              <IndianRupee className="w-3.5 h-3.5 text-green-600" />
              Payment Details
            </p>

            {/* Amount input */}
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">
                Amount (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                  ₹
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setPaymentDone(false);
                  }}
                  placeholder="0.00"
                  min={1}
                  step={0.01}
                  className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-background border border-border text-sm font-bold focus:outline-none focus:ring-2 focus:ring-green-500/20"
                />
              </div>
            </div>

            {/* Quick amounts */}
            <div className="flex gap-1.5 flex-wrap">
              {QUICK_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => {
                    setAmount(String(amt));
                    setPaymentDone(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    amount === String(amt)
                      ? "bg-green-600 text-white"
                      : "bg-secondary border border-border text-muted-foreground hover:bg-green-500/10 hover:text-green-600"
                  }`}
                >
                  ₹{amt.toLocaleString("en-IN")}
                </button>
              ))}
            </div>

            {/* Note */}
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">
                Payment Note (optional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Trip expenses, Hotel split, Dinner..."
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs focus:outline-none focus:ring-2 focus:ring-green-500/20"
              />
            </div>
          </div>

          {/* Payment Summary */}
          {canPay && (
            <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/20 space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Payment Summary
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[9px] font-bold">
                    {direction === "AtoB" ? "A" : "B"}
                  </span>
                  <span className="text-muted-foreground truncate max-w-[80px]">
                    {senderName || senderUpi}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-green-600">
                    ₹{Number(amount).toLocaleString("en-IN")}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center text-[9px] font-bold">
                    {direction === "AtoB" ? "B" : "A"}
                  </span>
                  <span className="text-muted-foreground truncate max-w-[80px]">
                    {receiverName || receiverUpi}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Smartphone className="w-3 h-3" />
                <span>
                  Via{" "}
                  <span className="font-semibold text-card-foreground">
                    {selectedApp.name}
                  </span>{" "}
                  · To:{" "}
                  <span className="font-mono text-card-foreground">
                    {receiverUpi}
                  </span>
                </span>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-2">
            {paymentDone ? (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500/10 border border-green-500/20">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <p className="text-sm font-semibold text-green-600">
                    Payment app opened!
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground text-center">
                  Complete the payment in your UPI app. The transaction is
                  handled entirely by your bank.
                </p>
                <button
                  onClick={reset}
                  className="w-full py-2 rounded-xl bg-secondary text-xs font-semibold text-muted-foreground hover:bg-secondary/80 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Make another payment
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={handlePay}
                  disabled={!canPay}
                  className="w-full py-3 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <span className="text-lg">{selectedApp.emoji}</span>
                  {canPay
                    ? `Pay ₹${Number(amount).toLocaleString("en-IN")} via ${selectedApp.name}`
                    : "Fill in details to pay"}
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={copyUPILink}
                    disabled={!canPay}
                    className="flex-1 py-2 rounded-xl bg-secondary border border-border text-xs font-semibold text-muted-foreground hover:bg-secondary/80 disabled:opacity-40 flex items-center justify-center gap-1.5 transition-colors"
                    title="Copy UPI deep link"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy UPI Link
                  </button>
                  <button
                    onClick={() => {
                      if (!canPay) return;
                      const link = buildUPILink(
                        selectedApp,
                        receiverUpi,
                        receiverName || "Payee",
                        parseFloat(amount).toFixed(2),
                        note,
                      );
                      window.open(link, "_blank");
                    }}
                    disabled={!canPay}
                    className="flex-1 py-2 rounded-xl bg-secondary border border-border text-xs font-semibold text-muted-foreground hover:bg-secondary/80 disabled:opacity-40 flex items-center justify-center gap-1.5 transition-colors"
                    title="Open payment link"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Link
                  </button>
                </div>
              </>
            )}
          </div>

          {/* UPI ID format help */}
          <div className="p-3 rounded-xl bg-secondary/40 border border-border space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground">
              💡 Common UPI ID formats:
            </p>
            {[
              { format: "number@paytm", label: "Paytm" },
              { format: "number@ybl", label: "PhonePe / Yes Bank" },
              { format: "name@okaxis", label: "Google Pay / Axis" },
              { format: "number@okhdfcbank", label: "Google Pay / HDFC" },
              { format: "number@oksbi", label: "Google Pay / SBI" },
              { format: "name@upi", label: "BHIM / General" },
            ].map(({ format, label }) => (
              <div key={format} className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-card-foreground">
                  {format}
                </span>
                <span className="text-[9px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>

          {/* Disclaimer */}
          <p className="text-[10px] text-muted-foreground text-center leading-relaxed px-2">
            🔒 Radiator Routes does not process or store payment data. All
            transactions are handled directly by your UPI app and bank.
          </p>
        </div>
      )}
    </div>
  );
}
