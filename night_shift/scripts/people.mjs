export const people = [
  { name: "Maya Chen", role: "support", email: "maya@example.com", slack: "maya" },
  { name: "Theo Barnes", role: "engineer", email: "theo@example.com", slack: "theo" },
  { name: "Priya Patel", role: "engineer", email: "priya@example.com", slack: "priya" },
  { name: "Sam Ortiz", role: "customer", email: "sam.ortiz@example.com", slack: "sam" },
  { name: "Jordan Lee", role: "customer", email: "jordan.lee@example.com", slack: "jordan" },
  { name: "Alex Kim", role: "customer", email: "alex.kim@example.com", slack: "alex" },
];

export function fakeName(seed) {
  const idx = seed % people.length;
  return people[idx].name;
}
