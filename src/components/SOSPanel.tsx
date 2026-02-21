import { useState, useEffect, useCallback } from "react";
import {
  Phone,
  MessageSquare,
  MapPin,
  Plus,
  Trash2,
  AlertTriangle,
  Shield,
  User,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  Navigation,
  PhoneCall,
  Send,
  Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relation: string;
}

const STORAGE_KEY = "radiator_emergency_contacts";
const RELATIONS = ["Family", "Friend", "Partner", "Colleague", "Doctor", "Other"];

const EMERGENCY_SERVICES = [
  { name: "Police", number: "100", emoji: "👮" },
  { name: "Ambulance", number: "108", emoji: "🚑" },
  { name: "Women Helpline", number: "1091", emoji: "👩" },
  { name: "Fire", number: "101", emoji: "🚒" },
  { name: "Disaster", number: "1078", emoji: "🆘" },
  { name: "Child Help", number: "1098", emoji: "👶" },
];

function loadContacts(): EmergencyContact[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveContacts(contacts: EmergencyContact[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
}

function generateId() {
  return `ec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatPhone(phone: string): string {
  // Strip all non-digits
  const digits = phone.replace(/\D/g, "");
  // Add country code if missing
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

export default function SOSPanel() {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<EmergencyContact[]>(loadContacts);
  const [collapsed, setCollapsed] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [sosActive, setSosActive] = useState(false);
  const [sosStep, setSosStep] = useState<"idle" | "locating" | "sending" | "done">("idle");
  const [liveLocation, setLiveLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string[]>([]);
  const [confirmHold, setConfirmHold] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [holdTimer, setHoldTimer] = useState<NodeJS.Timeout | null>(null);

  // New contact form state
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRelation, setNewRelation] = useState("Family");

  useEffect(() => {
    saveContacts(contacts);
  }, [contacts]);

  const addContact = () => {
    if (!newName.trim() || !newPhone.trim()) {
      toast({ title: "Please fill in name and phone number", variant: "destructive" });
      return;
    }
    const phone = newPhone.replace(/\s/g, "");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      toast({ title: "Invalid phone number", description: "Please enter a valid 10-digit number", variant: "destructive" });
      return;
    }
    const contact: EmergencyContact = {
      id: generateId(),
      name: newName.trim(),
      phone: phone,
      relation: newRelation,
    };
    setContacts((prev) => [...prev, contact]);
    setNewName("");
    setNewPhone("");
    setNewRelation("Family");
    setShowAddForm(false);
    toast({ title: "Emergency contact added ✅", description: `${contact.name} added as emergency contact` });
  };

  const removeContact = (id: string) => {
    const contact = contacts.find((c) => c.id === id);
    if (!confirm(`Remove ${contact?.name} from emergency contacts?`)) return;
    setContacts((prev) => prev.filter((c) => c.id !== id));
    toast({ title: "Contact removed" });
  };

  const getLocation = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation not supported"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(new Error(err.message)),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const buildSMSMessage = (lat: number, lng: number): string => {
    const mapsLink = `https://maps.google.com/?q=${lat},${lng}`;
    return `🆘 SOS ALERT! I need help. My current location: ${mapsLink} - Sent via Radiator Routes Emergency System. Please respond immediately!`;
  };

  const triggerSOS = useCallback(async () => {
    if (contacts.length === 0) {
      toast({
        title: "No emergency contacts!",
        description: "Please add at least one emergency contact first.",
        variant: "destructive",
      });
      return;
    }

    setSosActive(true);
    setSosStep("locating");
    setSentTo([]);
    setLocationError(null);

    let location: { lat: number; lng: number };

    try {
      location = await getLocation();
      setLiveLocation(location);
    } catch (err: any) {
      setLocationError(err.message);
      // Use a fallback message without location
      location = { lat: 0, lng: 0 };
    }

    setSosStep("sending");

    const message = location.lat !== 0
      ? buildSMSMessage(location.lat, location.lng)
      : "🆘 SOS ALERT! I need immediate help. I was unable to share my location. Please call me immediately! - Sent via Radiator Routes Emergency System";

    // Open SMS for each contact sequentially
    const sent: string[] = [];

    // For mobile: open SMS app for first contact, then prompt for others
    contacts.forEach((contact, index) => {
      const phone = formatPhone(contact.phone);
      const encodedMsg = encodeURIComponent(message);
      const smsUrl = `sms:${phone}?body=${encodedMsg}`;

      // Stagger the opening of SMS windows slightly
      setTimeout(() => {
        const link = document.createElement("a");
        link.href = smsUrl;
        link.click();
        sent.push(contact.name);
        setSentTo([...sent]);
      }, index * 800);
    });

    // After all SMS are queued, initiate a call to the first contact
    setTimeout(() => {
      const firstContact = contacts[0];
      const phone = formatPhone(firstContact.phone);
      const callLink = document.createElement("a");
      callLink.href = `tel:${phone}`;
      callLink.click();
    }, contacts.length * 800 + 500);

    setTimeout(() => {
      setSosStep("done");
      toast({
        title: "🆘 SOS Activated!",
        description: `Messages sent to ${contacts.length} contact(s). Calling ${contacts[0].name}...`,
      });
    }, contacts.length * 800 + 1000);
  }, [contacts, toast]);

  // Hold-to-activate SOS
  const startHold = () => {
    setConfirmHold(true);
    let progress = 0;
    const interval = setInterval(() => {
      progress += 4;
      setHoldProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setConfirmHold(false);
        setHoldProgress(0);
        triggerSOS();
      }
    }, 100);
    setHoldTimer(interval);
  };

  const cancelHold = () => {
    if (holdTimer) clearInterval(holdTimer);
    setHoldTimer(null);
    setConfirmHold(false);
    setHoldProgress(0);
  };

  const resetSOS = () => {
    setSosActive(false);
    setSosStep("idle");
    setSentTo([]);
    setLocationError(null);
  };

  const callContact = (contact: EmergencyContact) => {
    const phone = formatPhone(contact.phone);
    window.location.href = `tel:${phone}`;
  };

  const smsContact = (contact: EmergencyContact) => {
    const phone = formatPhone(contact.phone);
    const message = liveLocation
      ? buildSMSMessage(liveLocation.lat, liveLocation.lng)
      : "Hi, I need help. Please contact me.";
    const encoded = encodeURIComponent(message);
    window.location.href = `sms:${phone}?body=${encoded}`;
  };

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b border-border cursor-pointer"
        onClick={() => !sosActive && setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-red-500/10">
            <Shield className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-semibold text-card-foreground text-sm flex items-center gap-2">
              SOS & Emergency
              {contacts.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 font-bold border border-green-500/20">
                  {contacts.length} contact{contacts.length > 1 ? "s" : ""}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Emergency contacts · Live location sharing
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

          {/* SOS Active State */}
          {sosActive && (
            <div className="rounded-2xl border-2 border-red-500/50 bg-red-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                <span className="text-sm font-bold text-red-600">SOS ACTIVATED</span>
              </div>

              {sosStep === "locating" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                  Getting your live location...
                </div>
              )}

              {sosStep === "sending" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                    Sending emergency messages...
                  </div>
                  {sentTo.map((name) => (
                    <div key={name} className="flex items-center gap-2 text-xs text-green-600">
                      <Check className="w-3.5 h-3.5" />
                      SMS sent to {name}
                    </div>
                  ))}
                </div>
              )}

              {sosStep === "done" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-green-600">
                    <Check className="w-4 h-4" />
                    Emergency contacts alerted!
                  </div>
                  {liveLocation && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 text-red-500" />
                      Location shared: {liveLocation.lat.toFixed(5)}, {liveLocation.lng.toFixed(5)}
                    </div>
                  )}
                  {locationError && (
                    <div className="flex items-center gap-2 text-xs text-orange-500">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Location unavailable: {locationError}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    📱 SMS sent to {contacts.length} contact(s) · 📞 Calling {contacts[0]?.name}
                  </p>
                  <button
                    onClick={resetSOS}
                    className="mt-2 px-3 py-1.5 rounded-lg bg-card border border-border text-xs font-medium hover:bg-secondary transition-colors"
                  >
                    Close SOS
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SOS Button */}
          {!sosActive && (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="relative">
                {confirmHold && (
                  <svg
                    className="absolute inset-0 w-full h-full -rotate-90"
                    viewBox="0 0 100 100"
                  >
                    <circle
                      cx="50" cy="50" r="46"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="4"
                      strokeDasharray={`${2 * Math.PI * 46}`}
                      strokeDashoffset={`${2 * Math.PI * 46 * (1 - holdProgress / 100)}`}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dashoffset 0.1s linear" }}
                    />
                  </svg>
                )}
                <button
                  onMouseDown={startHold}
                  onMouseUp={cancelHold}
                  onMouseLeave={cancelHold}
                  onTouchStart={startHold}
                  onTouchEnd={cancelHold}
                  className={`w-24 h-24 rounded-full font-bold text-white text-sm shadow-lg flex flex-col items-center justify-center gap-1 select-none transition-all active:scale-95 ${
                    confirmHold
                      ? "bg-red-700 scale-105"
                      : "bg-red-600 hover:bg-red-700"
                  }`}
                  style={{
                    boxShadow: confirmHold
                      ? "0 0 0 8px rgba(239,68,68,0.25), 0 0 30px rgba(239,68,68,0.4)"
                      : "0 0 0 4px rgba(239,68,68,0.15)",
                  }}
                >
                  <AlertTriangle className="w-6 h-6" />
                  <span className="text-xs font-black tracking-widest">SOS</span>
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                {confirmHold
                  ? "Keep holding to send SOS..."
                  : "Hold button to send SOS alert\nwith live location to all contacts"}
              </p>
            </div>
          )}

          {/* Emergency Services */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Emergency Services
            </p>
            <div className="grid grid-cols-3 gap-2">
              {EMERGENCY_SERVICES.map((svc) => (
                <a
                  key={svc.number}
                  href={`tel:${svc.number}`}
                  className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors text-center border border-border"
                >
                  <span className="text-lg">{svc.emoji}</span>
                  <span className="text-[10px] font-semibold text-card-foreground">
                    {svc.name}
                  </span>
                  <span className="text-[11px] font-bold text-red-600">
                    {svc.number}
                  </span>
                </a>
              ))}
            </div>
          </div>

          {/* Emergency Contacts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Emergency Contacts
              </p>
              <button
                onClick={() => setShowAddForm((v) => !v)}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>

            {/* Add Contact Form */}
            {showAddForm && (
              <div className="mb-3 p-3 rounded-xl bg-secondary/40 border border-border space-y-2.5 animate-fade-in">
                <p className="text-xs font-semibold text-card-foreground">
                  New Emergency Contact
                </p>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Phone number (e.g. 9876543210)"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <select
                  value={newRelation}
                  onChange={(e) => setNewRelation(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {RELATIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={addContact}
                    className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90"
                  >
                    Save Contact
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="px-3 py-2 rounded-lg bg-secondary text-xs font-medium hover:bg-secondary/80"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Contacts List */}
            {contacts.length === 0 ? (
              <div className="flex flex-col items-center py-6 gap-2 text-center">
                <User className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">
                  No emergency contacts added yet.
                  <br />
                  Add contacts to activate SOS.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40 border border-border hover:bg-secondary/60 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary">
                        {contact.name[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-card-foreground truncate">
                        {contact.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {contact.relation} · {contact.phone}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => smsContact(contact)}
                        title="Send SMS"
                        className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => callContact(contact)}
                        title="Call"
                        className="p-1.5 rounded-lg bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removeContact(contact.id)}
                        title="Remove"
                        className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Location Share */}
          <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
            <p className="text-xs font-semibold text-blue-600 mb-2 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5" />
              Share Live Location
            </p>
            <button
              onClick={async () => {
                try {
                  const loc = await getLocation();
                  setLiveLocation(loc);
                  const mapsLink = `https://maps.google.com/?q=${loc.lat},${loc.lng}`;
                  if (navigator.share) {
                    await navigator.share({
                      title: "My Live Location",
                      text: `My current location: ${mapsLink}`,
                      url: mapsLink,
                    });
                  } else {
                    await navigator.clipboard.writeText(mapsLink);
                    toast({ title: "Location copied!", description: "Share it with your contacts." });
                  }
                } catch {
                  toast({ title: "Could not get location", variant: "destructive" });
                }
              }}
              className="w-full py-2 rounded-lg bg-blue-500/10 text-blue-600 text-xs font-semibold hover:bg-blue-500/20 transition-colors flex items-center justify-center gap-2"
            >
              <MapPin className="w-3.5 h-3.5" />
              Share My Location Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
