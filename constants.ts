
import { Product, Table } from "./types";

export const IMAGES = {
  profile: "https://lh3.googleusercontent.com/aida-public/AB6AXuC_cY6IKIjPq4YLwoEiTjo8UIWOW4RJdHZMM691qy8BTxdIfQkPSKEfDhzb64CbPWKOjU2TlpBtnNLuaHS437ClNHXB2fXd71LsEVA_0IzAOks8cT8tRIWPq0km12HuhED4gMb8C-9RbfA7_nHA-rYMUsnH1YFTzRxi0YkMhBNP9Ro6wSSLiUCPI1oWElcymZirdEP8PdlpEogYj7P8D8dCUMZEKIOdR7fuw7pclbBcVakV68hRivbccH1sdxHMfryY0_BZuIORZCWi",
  logo_bg: "https://lh3.googleusercontent.com/aida-public/AB6AXuDnNGs1SiOJSuMDneU7GAOtamLqIWLNHTciXAGVwqKBqF8KoZF4XpECgxqq3QFrH1oT4hBBRHW4GA0q3A3ZBkaVAS6YVJppRiQagAZ8jZSwnRy-wuTsfkshj1uac7EAVdeKk5nOkptbvFRSgOa7ZVR64gjO6Kj8s-QBYUitPTeLpFBanOsRC6M0HCUVTsqcGIBk4nb0lhTv3PmCIdrfTct5XPx8OPx2kUQXeEFqttLwNZC9O3hVDnQSZmMgLgV6eGbFjouz9PIN3Zap",
  // Placeholders kept just in case, but PRODUCTS will be empty.
};

export const PRODUCTS: Product[] = [];

export const TABLES: Table[] = [
  { id: "T-01", label: "T-01", status: "occupied", room: "Sala Principal", time: "1h 24m", amount: 45.50 },
  { id: "T-02", label: "T-02", status: "available", room: "Sala Principal" },
  { id: "T-03", label: "T-03", status: "occupied", room: "Sala Principal", time: "45m", amount: 82.10 },
  { id: "T-04", label: "T-04", status: "reserved", room: "Sala Principal", customer: "Smith", time: "7 PM" },
  { id: "T-05", label: "T-05", status: "available", room: "Sala Principal" },
  { id: "T-06", label: "T-06", status: "available", room: "Sala Principal" },
  { id: "T-07", label: "T-07", status: "occupied", room: "Sala Principal", time: "12m", amount: 22.40 },
  { id: "T-08", label: "T-08", status: "available", room: "Sala Principal" },
  { id: "T-09", label: "T-09", status: "occupied", room: "Terraza", time: "2h+", amount: 156.90 },
  { id: "T-10", label: "T-10", status: "available", room: "Terraza" },
  { id: "T-11", label: "T-11", status: "occupied", room: "Terraza", time: "55m", amount: 67.00 },
  { id: "T-12", label: "T-12", status: "reserved", room: "Terraza", customer: "Doe P.", time: "8:30" },
  { id: "T-13", label: "T-13", status: "available", room: "Bar" },
  { id: "T-14", label: "T-14", status: "available", room: "Bar" },
  { id: "T-15", label: "T-15", status: "available", room: "Bar" },
  { id: "T-16", label: "T-16", status: "occupied", room: "Bar", time: "15m", amount: 34.20 },
];
