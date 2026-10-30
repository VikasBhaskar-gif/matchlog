import { fetchFotmobPlayerPhoto } from "./fotmob-photo-service.js";

async function main() {
  const players = [
    { name: "Raphinha", team: "Barcelona" },
    { name: "Lamine Yamal", team: "Barcelona" },
    { name: "Pedri", team: "Barcelona" },
    { name: "Anthony Gordon", team: "Barcelona" },
    { name: "Joan García", team: "Barcelona" },
    { name: "Pau Cubarsí", team: "Barcelona" },
    { name: "Xavi Espart", team: "Barcelona" },
    { name: "Gerard Martín", team: "Barcelona" },
    { name: "Rodri", team: "Barcelona" },
    { name: "Fermín López", team: "Barcelona" },
    { name: "João Cancelo", team: "Barcelona" },
    { name: "Kylian Mbappé", team: "Real Madrid" },
    { name: "Jude Bellingham", team: "Real Madrid" },
    { name: "Dean Huijsen", team: "Real Madrid" },
    { name: "Ousmane Dembélé", team: "Paris Saint-Germain" },
    { name: "Khvicha Kvaratskhelia", team: "Paris Saint-Germain" },
  ];

  for (const p of players) {
    const photo = await fetchFotmobPlayerPhoto(p.name, p.team);
    console.log(`${p.name} (${p.team}) => ${photo}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));
