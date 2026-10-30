export interface VerifiedGoal {
  minute: number;
  playerName: string;
  isHomeTeam: boolean;
  type?: "GOAL" | "PENALTY_GOAL" | "OWN_GOAL";
  position?: string;
  nationality?: string;
}

export interface MatchVerifiedScorers {
  matchId: string;
  goals: VerifiedGoal[];
}

export const VERIFIED_MATCHES: MatchVerifiedScorers[] = [
  // 1. Paris Saint-Germain FC 4 - 2 FC Barcelona (LEAGUE_STAGE Matchday 3, Oct 20, 2026)
  {
    matchId: "e0df6b44-07b4-466f-a75f-0d9e0a81e486",
    goals: [
      { minute: 38, playerName: "Desire Doue", isHomeTeam: true, position: "Attack", nationality: "France" },
      { minute: 55, playerName: "Xavi Espart", isHomeTeam: false, position: "Defence", nationality: "Spain" },
      { minute: 72, playerName: "Lucas Hernández", isHomeTeam: true, position: "Defence", nationality: "France" },
      { minute: 79, playerName: "Lamine Yamal", isHomeTeam: false, position: "Attack", nationality: "Spain" },
      { minute: 81, playerName: "Vitinha", isHomeTeam: true, position: "Midfield", nationality: "Portugal" },
      { minute: 86, playerName: "Fabián Ruiz", isHomeTeam: true, position: "Midfield", nationality: "Spain" },
    ],
  },
  // 2. FC Barcelona 1 - 2 Real Madrid CF (Matchday 10, Oct 25, 2026)
  {
    matchId: "5d5ee9be-7db9-41b3-ada2-24772050e2df",
    goals: [
      { minute: 41, playerName: "Kylian Mbappé", isHomeTeam: false, position: "Attack", nationality: "France" },
      { minute: 61, playerName: "Raphinha", isHomeTeam: true, position: "Attack", nationality: "Brazil" },
      { minute: 87, playerName: "Kylian Mbappé", isHomeTeam: false, position: "Attack", nationality: "France" },
    ],
  },
  // 3. Real Betis Balompié 2 - 5 FC Barcelona (Matchday 9, Oct 17, 2026)
  {
    matchId: "1a2ee2e8-d518-41d4-b8a2-e3b246b9eea2",
    goals: [
      { minute: 10, playerName: "Lamine Yamal", isHomeTeam: false, position: "Attack", nationality: "Spain" },
      { minute: 28, playerName: "Valentín Gómez", isHomeTeam: true, position: "Defence", nationality: "Argentina" },
      { minute: 41, playerName: "Rodri", isHomeTeam: false, position: "Midfield", nationality: "Spain" },
      { minute: 52, playerName: "Gabriel Jesus", isHomeTeam: false, position: "Attack", nationality: "Brazil" },
      { minute: 53, playerName: "Ez Abde", isHomeTeam: true, position: "Attack", nationality: "Morocco" },
      { minute: 62, playerName: "Eric García", isHomeTeam: false, position: "Defence", nationality: "Spain" },
      { minute: 81, playerName: "Dani Olmo", isHomeTeam: false, position: "Midfield", nationality: "Spain" },
    ],
  },
  // 4. FC Barcelona 3 - 0 Getafe CF (Matchday 8, Oct 10, 2026)
  {
    matchId: "a2e246f7-9088-483c-86c4-33a0273e6fee",
    goals: [
      { minute: 2, playerName: "Anthony Gordon", isHomeTeam: true, position: "Attack", nationality: "England" },
      { minute: 30, playerName: "Gabriel Jesus", isHomeTeam: true, position: "Attack", nationality: "Brazil" },
      { minute: 73, playerName: "Jules Koundé", isHomeTeam: true, position: "Defence", nationality: "France" },
    ],
  },
  // 5. Sevilla FC 1 - 3 FC Barcelona (Matchday 7, Sep 19, 2026)
  {
    matchId: "5c4fd721-565c-4dc4-9726-47f15d1d4bac",
    goals: [
      { minute: 19, playerName: "Datro Fofana", isHomeTeam: true, position: "Attack", nationality: "Ivory Coast" },
      { minute: 22, playerName: "Raphinha", isHomeTeam: false, position: "Attack", nationality: "Brazil" },
      { minute: 52, playerName: "Raphinha", isHomeTeam: false, position: "Attack", nationality: "Brazil" },
      { minute: 69, playerName: "Raphinha", isHomeTeam: false, position: "Attack", nationality: "Brazil" },
    ],
  },
  // 6. FC Barcelona 7 - 2 Real Racing Club de Santander (Matchday 6, Sep 16, 2026)
  {
    matchId: "6b5d55e4-5aa5-4436-ada9-c87bd347663f",
    goals: [
      { minute: 11, playerName: "Raphinha", isHomeTeam: true, type: "PENALTY_GOAL", position: "Attack", nationality: "Brazil" },
      { minute: 24, playerName: "João Cancelo", isHomeTeam: true, position: "Defence", nationality: "Portugal" },
      { minute: 32, playerName: "Maguette Gueye", isHomeTeam: false, position: "Midfield", nationality: "Senegal" },
      { minute: 39, playerName: "Gabriel Jesus", isHomeTeam: true, position: "Attack", nationality: "Brazil" },
      { minute: 44, playerName: "Raphinha", isHomeTeam: true, position: "Attack", nationality: "Brazil" },
      { minute: 52, playerName: "Lamine Yamal", isHomeTeam: true, position: "Attack", nationality: "Spain" },
      { minute: 68, playerName: "Raphinha", isHomeTeam: true, type: "PENALTY_GOAL", position: "Attack", nationality: "Brazil" },
      { minute: 77, playerName: "Yassir Zabiri", isHomeTeam: false, position: "Attack", nationality: "Morocco" },
      { minute: 84, playerName: "Asier Villalibre", isHomeTeam: true, type: "OWN_GOAL", position: "Attack", nationality: "Spain" },
    ],
  },
  // 7. Galatasaray SK 1 - 4 FC Barcelona (LEAGUE_STAGE Matchday 2, Oct 13, 2026)
  {
    matchId: "5c43741a-f0ef-437d-a9e6-b7e498241dcb",
    goals: [
      { minute: 28, playerName: "Aleksey Batrakov", isHomeTeam: true, position: "Midfield", nationality: "Russia" },
      { minute: 43, playerName: "João Cancelo", isHomeTeam: false, position: "Defence", nationality: "Portugal" },
      { minute: 50, playerName: "Fermín López", isHomeTeam: false, position: "Midfield", nationality: "Spain" },
      { minute: 53, playerName: "Anthony Gordon", isHomeTeam: false, position: "Attack", nationality: "England" },
      { minute: 65, playerName: "Karim Adeyemi", isHomeTeam: false, position: "Attack", nationality: "Germany" },
    ],
  },
  // 8. FC Barcelona 5 - 1 Feyenoord Rotterdam (LEAGUE_STAGE Matchday 1, Sep 9, 2026)
  {
    matchId: "02ac09ac-0820-481b-b472-dba4ef09ffec",
    goals: [
      { minute: 3, playerName: "Raphinha", isHomeTeam: true, position: "Attack", nationality: "Brazil" },
      { minute: 8, playerName: "Sem Steijn", isHomeTeam: false, position: "Midfield", nationality: "Netherlands" },
      { minute: 22, playerName: "Karim Adeyemi", isHomeTeam: true, position: "Attack", nationality: "Germany" },
      { minute: 45, playerName: "Lamine Yamal", isHomeTeam: true, position: "Attack", nationality: "Spain" },
      { minute: 58, playerName: "Raphinha", isHomeTeam: true, position: "Attack", nationality: "Brazil" },
      { minute: 70, playerName: "Gabriel Jesus", isHomeTeam: true, position: "Attack", nationality: "Brazil" },
    ],
  },
  // 9. Elche CF 0 - 5 FC Barcelona (Matchday 2, Aug 23, 2026)
  {
    matchId: "38975a4c-9524-4c39-9882-4064ef15244e",
    goals: [
      { minute: 14, playerName: "Raphinha", isHomeTeam: false, type: "PENALTY_GOAL", position: "Attack", nationality: "Brazil" },
      { minute: 45, playerName: "Karim Adeyemi", isHomeTeam: false, position: "Attack", nationality: "Germany" },
      { minute: 67, playerName: "Raphinha", isHomeTeam: false, position: "Attack", nationality: "Brazil" },
      { minute: 71, playerName: "Fermín López", isHomeTeam: false, position: "Midfield", nationality: "Spain" },
      { minute: 79, playerName: "Fermín López", isHomeTeam: false, position: "Midfield", nationality: "Spain" },
    ],
  },
  // 10. FC Barcelona 2 - 0 Athletic Club (Matchday 1, Aug 27, 2026)
  {
    matchId: "d005db8a-dfff-4714-bd37-5d1fdff06d13",
    goals: [
      { minute: 37, playerName: "Raphinha", isHomeTeam: true, position: "Attack", nationality: "Brazil" },
      { minute: 82, playerName: "Fermín López", isHomeTeam: true, position: "Midfield", nationality: "Spain" },
    ],
  },
  // 11. FC Barcelona 5 - 2 Rayo Vallecano de Madrid (Matchday 3, Aug 31, 2026)
  {
    matchId: "dcfe6707-848e-4376-be1a-049021cb510f",
    goals: [
      { minute: 12, playerName: "Sergio Camello", isHomeTeam: false, position: "Attack", nationality: "Spain" },
      { minute: 19, playerName: "Raphinha", isHomeTeam: true, position: "Attack", nationality: "Brazil" },
      { minute: 21, playerName: "Lamine Yamal", isHomeTeam: true, position: "Attack", nationality: "Spain" },
      { minute: 51, playerName: "Florian Lejeune", isHomeTeam: true, type: "OWN_GOAL", position: "Defence", nationality: "France" },
      { minute: 59, playerName: "Sergio Camello", isHomeTeam: false, position: "Attack", nationality: "Spain" },
      { minute: 71, playerName: "Raphinha", isHomeTeam: true, position: "Attack", nationality: "Brazil" },
      { minute: 90, playerName: "Lamine Yamal", isHomeTeam: true, position: "Attack", nationality: "Spain" },
    ],
  },
  // 12. Levante UD 2 - 4 FC Barcelona (Matchday 5, Sep 13, 2026)
  {
    matchId: "e9c3890e-e2f1-4303-83c6-7e3421f82868",
    goals: [
      { minute: 5, playerName: "Xavi Espart", isHomeTeam: false, position: "Defence", nationality: "Spain" },
      { minute: 19, playerName: "Lamine Yamal", isHomeTeam: false, position: "Attack", nationality: "Spain" },
      { minute: 48, playerName: "Lamine Yamal", isHomeTeam: false, type: "PENALTY_GOAL", position: "Attack", nationality: "Spain" },
      { minute: 79, playerName: "Iván Romero", isHomeTeam: true, position: "Attack", nationality: "Spain" },
      { minute: 88, playerName: "Roger Brugué", isHomeTeam: true, position: "Attack", nationality: "Spain" },
      { minute: 92, playerName: "Karim Adeyemi", isHomeTeam: false, position: "Attack", nationality: "Germany" },
    ],
  },
  // 13. Valencia CF 0 - 5 FC Barcelona (Matchday 4, Sep 6, 2026)
  {
    matchId: "f3dea05e-3863-4019-8b68-350364424c81",
    goals: [
      { minute: 6, playerName: "Lamine Yamal", isHomeTeam: false, position: "Attack", nationality: "Spain" },
      { minute: 22, playerName: "Fermín López", isHomeTeam: false, position: "Midfield", nationality: "Spain" },
      { minute: 50, playerName: "Raphinha", isHomeTeam: false, position: "Attack", nationality: "Brazil" },
      { minute: 79, playerName: "Pedri", isHomeTeam: false, position: "Midfield", nationality: "Spain" },
      { minute: 84, playerName: "Lamine Yamal", isHomeTeam: false, position: "Attack", nationality: "Spain" },
    ],
  },
  // 14. Manchester City FC 2 - 4 Paris Saint-Germain FC (LEAGUE_STAGE Matchday 2, Oct 14, 2026)
  {
    matchId: "658b3a8e-ecb7-46b5-9ecc-d8c50807cb4d",
    goals: [
      { minute: 13, playerName: "Desire Doue", isHomeTeam: false, position: "Attack", nationality: "France" },
      { minute: 15, playerName: "Ousmane Dembélé", isHomeTeam: false, position: "Attack", nationality: "France" },
      { minute: 32, playerName: "Vitinha", isHomeTeam: false, position: "Midfield", nationality: "Portugal" },
      { minute: 53, playerName: "Erling Haaland", isHomeTeam: true, position: "Attack", nationality: "Norway" },
      { minute: 62, playerName: "Maghnes Akliouche", isHomeTeam: false, position: "Attack", nationality: "France" },
      { minute: 75, playerName: "Erling Haaland", isHomeTeam: true, position: "Attack", nationality: "Norway" },
    ],
  },
  // 15. Liverpool FC 0 - 3 Manchester City FC (Matchday 6, Oct 11, 2026)
  {
    matchId: "feb7fb0c-3636-49d1-8d59-6f8e8c1142bb",
    goals: [
      { minute: 65, playerName: "Erling Haaland", isHomeTeam: false, position: "Attack", nationality: "Norway" },
      { minute: 68, playerName: "Jérémy Doku", isHomeTeam: false, position: "Attack", nationality: "Belgium" },
      { minute: 78, playerName: "Rayan Cherki", isHomeTeam: false, position: "Attack", nationality: "France" },
    ],
  },
  // 16. Club Atlético de Madrid 2 - 1 Real Madrid CF (Matchday 7, Sep 20, 2026)
  {
    matchId: "ee5baad7-dac0-43d4-8b01-ad20d20d3771",
    goals: [
      { minute: 53, playerName: "Alejandro Grimaldo", isHomeTeam: true, type: "PENALTY_GOAL", position: "Defence", nationality: "Spain" },
      { minute: 59, playerName: "Jonathan David", isHomeTeam: true, position: "Attack", nationality: "Canada" },
      { minute: 89, playerName: "Antonio Rüdiger", isHomeTeam: false, position: "Defence", nationality: "Germany" },
    ],
  },
  // 17. Real Madrid CF 2 - 1 FC Internazionale Milano (LEAGUE_STAGE Matchday 1, Sep 8, 2026)
  {
    matchId: "fb972384-1728-4410-bc38-f6848533a142",
    goals: [
      { minute: 14, playerName: "Kylian Mbappé", isHomeTeam: true, position: "Attack", nationality: "France" },
      { minute: 23, playerName: "Federico Valverde", isHomeTeam: true, position: "Midfield", nationality: "Uruguay" },
      { minute: 77, playerName: "Carlos Augusto", isHomeTeam: false, position: "Defence", nationality: "Brazil" },
    ],
  },
  // 18. Liverpool FC 2 - 1 Club Atlético de Madrid (LEAGUE_STAGE Matchday 1, Sep 9, 2026)
  {
    matchId: "0f142e15-e18c-490a-a9b2-31e907dd4322",
    goals: [
      { minute: 19, playerName: "Marcos Llorente", isHomeTeam: false, position: "Midfield", nationality: "Spain" },
      { minute: 40, playerName: "Dominik Szoboszlai", isHomeTeam: true, position: "Midfield", nationality: "Hungary" },
      { minute: 50, playerName: "Alexis Mac Allister", isHomeTeam: true, position: "Midfield", nationality: "Argentina" },
    ],
  },
  // 19. AS Roma 3 - 4 Real Madrid CF (LEAGUE_STAGE Matchday 2, Oct 14, 2026)
  {
    matchId: "0fa600cb-7f06-4e5c-ad21-59738fa3e86e",
    goals: [
      { minute: 20, playerName: "Marten de Roon", isHomeTeam: true, position: "Midfield", nationality: "Netherlands" },
      { minute: 25, playerName: "Kylian Mbappé", isHomeTeam: false, position: "Attack", nationality: "France" },
      { minute: 51, playerName: "Donyell Malen", isHomeTeam: true, position: "Attack", nationality: "Netherlands" },
      { minute: 57, playerName: "Donyell Malen", isHomeTeam: true, position: "Attack", nationality: "Netherlands" },
      { minute: 83, playerName: "Carlos Espí", isHomeTeam: false, position: "Attack", nationality: "Spain" },
      { minute: 85, playerName: "Endrick", isHomeTeam: false, position: "Attack", nationality: "Brazil" },
      { minute: 89, playerName: "Antonio Rüdiger", isHomeTeam: false, position: "Defence", nationality: "Germany" },
    ],
  },
  // 20. Everton FC 2 - 2 Manchester United FC (Matchday 3, Sep 6, 2026)
  {
    matchId: "b0051051-bed4-4f9b-8cf8-9c4818f686f3",
    goals: [
      { minute: 47, playerName: "Bryan Mbeumo", isHomeTeam: false, position: "Attack", nationality: "Cameroon" },
      { minute: 83, playerName: "Tyrique George", isHomeTeam: true, position: "Attack", nationality: "England" },
      { minute: 88, playerName: "Benjamin Šeško", isHomeTeam: false, position: "Attack", nationality: "Slovenia" },
      { minute: 96, playerName: "Ainsley Maitland-Niles", isHomeTeam: true, position: "Midfield", nationality: "England" },
    ],
  },
];
