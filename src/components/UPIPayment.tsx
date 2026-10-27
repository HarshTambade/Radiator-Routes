import { useState, useEffect } from "react";
import {
  Wallet,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  User,
  IndianRupee,
  CheckCircle2,
  Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Payee {
  id: string;
  name: string;
  upiId: string;
}

interface Props {
  memberNames?: string[];
}

const STORAGE_KEY = "rr_upi_payees";

function buildUPILink(
  upiId: string,
  name: string,
  amount: string,
  note: string,
) {
  const params = new URLSearchParams({
    pa: upiId,
    pn: name || "Payee",
    am: parseFloat(amount).toFixed(2),
    cu: "INR",
    tn: note || "Payment via Radiator Routes",
  });
  return `upi://pay?${params.toString()}`;
}

export default function UPIPayment({ memberNames = [] }: Props) {
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUpi, setNewUpi] = useState("");

  // Load saved payees from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: Payee[] = JSON.parse(saved);
        setPayees(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Pre-populate from memberNames if payees list is empty
  useEffect(() => {
    if (payees.length === 0 && memberNames.length > 0) {
      const auto: Payee[] = memberNames.map((n, i) => ({
        id: `auto-${i}`,
        name: n,
        upiId: "",
      }));
      setPayees(auto);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberNames]);

  const savePayees = (updated: Payee[]) => {
    setPayees(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      /* ignore */
    }
  };

  const addPayee = () => {
    if (!newName.trim()) {
      toast({ title: "Enter a name", variant: "destructive" });
      return;
    }
    if (!newUpi.includes("@")) {
      toast({
        title: "Enter a valid UPI ID (must contain @)",
        variant: "destructive",
      });
      return;
    }
    const payee: Payee = {
      id: Date.now().toString(),
      name: newName.trim(),
      upiId: newUpi.trim(),
    };
    savePayees([...payees, payee]);
    setNewName("");
    setNewUpi("");
    setShowAdd(false);
    setSelectedId(payee.id);
    toast({ title: `${payee.name} added!` });
  };

  const removePayee = (id: string) => {
    savePayees(payees.filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const updatePayeeUpi = (id: string, upiId: string) => {
    const updated = payees.map((p) => (p.id === id ? { ...p, upiId } : p));
    savePayees(updated);
  };

  const selectedPayee = payees.find((p) => p.id === selectedId);
  const canPay =
    !!selectedPayee &&
    selectedPayee.upiId.includes("@") &&
    parseFloat(amount) > 0;

  const handlePay = () => {
    if (!canPay || !selectedPayee) {
      toast({
        title: "Cannot pay",
        description: !selectedPayee
          ? "Select a person to pay."
          : !selectedPayee.upiId.includes("@")
            ? "Add a valid UPI ID for this person first."
            : "Enter a valid amount.",
        variant: "destructive",
      });
      return;
    }
    const link = buildUPILink(
      selectedPayee.upiId,
      selectedPayee.name,
      amount,
      note || `Payment to ${selectedPayee.name} via Radiator Routes`,
    );
    const anchor = document.createElement("a");
    anchor.href = link;
    anchor.rel = "noopener noreferrer";
    anchor.click();
    toast({
      title: `Opening UPI app…`,
      description: `Paying ₹${amount} to ${selectedPayee.name}`,
    });
  };

  const QUICK_AMOUNTS = [50, 100, 200, 500, 1000, 2000];

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
              Tap a person → enter amount → pay instantly
            </p>
          </div>
        </div>
        <div className="text-muted-foreground">
          {collapsed ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 space-y-4">
          {/* Info */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
            <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Select who you want to pay. Your UPI app opens with their ID
              prefilled — no data leaves your device.
            </p>
          </div>

          {/* Payee list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-card-foreground">
                Who are you paying?
              </p>
              <button
                onClick={() => setShowAdd((v) => !v)}
                className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
              >
                <Plus className="w-3 h-3" />
                Add person
              </button>
            </div>

            {payees.length === 0 && !showAdd && (
              <div className="text-center py-6 border-2 border-dashed border-border rounded-xl">
                <User className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No payees yet.</p>
                <button
                  onClick={() => setShowAdd(true)}
                  className="mt-2 text-xs text-primary font-medium hover:underline"
                >
                  + Add someone
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2">
              {payees.map((p) => {
                const isSelected = selectedId === p.id;
                const hasUpi = p.upiId.includes("@");
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedId(isSelected ? null : p.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all ${
                      isSelected
                        ? "border-green-500 bg-green-500/5"
                        : "border-border bg-secondary/30 hover:border-primary/40 hover:bg-secondary/60"
                    }`}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                        isSelected
                          ? "bg-green-500 text-white"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>

                    {/* Name + UPI inline edit */}
                    <div
                      className="flex-1 min-w-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="text-sm font-semibold text-card-foreground truncate">
                        {p.name}
                      </p>
                      {isSelected ? (
                        <input
                          type="text"
                          value={p.upiId}
                          onChange={(e) =>
                            updatePayeeUpi(p.id, e.target.value.trim())
                          }
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Enter UPI ID (e.g. name@upi)"
                          className="mt-1 w-full px-2 py-1 rounded-lg bg-background border border-border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-green-500/30"
                        />
                      ) : (
                        <p
                          className={`text-[11px] font-mono truncate ${hasUpi ? "text-green-600" : "text-muted-foreground"}`}
                        >
                          {hasUpi ? p.upiId : "Tap to add UPI ID"}
                        </p>
                      )}
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {hasUpi && (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removePayee(p.id);
                        }}
                        className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add person form */}
            {showAdd && (
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2 mt-1">
                <p className="text-xs font-semibold text-card-foreground mb-1">
                  New Payee
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Name"
                      className="w-full pl-8 pr-3 py-2 rounded-xl bg-background border border-border text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                      @
                    </span>
                    <input
                      type="text"
                      value={newUpi}
                      onChange={(e) => setNewUpi(e.target.value.trim())}
                      placeholder="UPI ID"
                      className="w-full pl-5 pr-3 py-2 rounded-xl bg-background border border-border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addPayee}
                    className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setShowAdd(false);
                      setNewName("");
                      setNewUpi("");
                    }}
                    className="flex-1 py-2 rounded-xl bg-secondary text-secondary-foreground text-xs font-semibold hover:bg-secondary/80 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Amount section — shown when someone is selected */}
          {selectedPayee && (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-xs font-semibold text-card-foreground">
                Amount to pay{" "}
                <span className="text-green-600">{selectedPayee.name}</span>
              </p>

              {/* Quick amounts */}
              <div className="flex flex-wrap gap-1.5">
                {QUICK_AMOUNTS.map((q) => (
                  <button
                    key={q}
                    onClick={() => setAmount(String(q))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      amount === String(q)
                        ? "bg-green-500 text-white border-green-500"
                        : "bg-secondary border-border text-muted-foreground hover:border-primary hover:text-primary"
                    }`}
                  >
                    ₹{q}
                  </button>
                ))}
              </div>

              {/* Custom amount */}
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
                />
              </div>

              {/* Note */}
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional)"
                className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />

              {/* UPI ID warning */}
              {!selectedPayee.upiId.includes("@") && (
                <p className="text-xs text-orange-500 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  Tap on <strong>{selectedPayee.name}</strong> above and enter
                  their UPI ID first.
                </p>
              )}

              {/* Pay button */}
              <button
                onClick={handlePay}
                disabled={!canPay}
                className="w-full py-3 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Wallet className="w-4 h-4" />
                {canPay
                  ? `Pay ₹${amount} to ${selectedPayee.name}`
                  : "Select person & enter amount"}
              </button>

              <p className="text-[10px] text-center text-muted-foreground">
                Opens your UPI app (GPay, PhonePe, Paytm, etc.) with the details
                prefilled
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
