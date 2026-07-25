export const INITIAL_QUEUED_MATCHES = [
  {
    id: 'm1',
    p1: { name: 'Lucas Martin', points: 1540, club: 'TT Paris XIII' },
    p2: { name: 'Alexandre Dubois', points: 1485, club: 'US Métro' },
    category: 'Open A - Poule A',
    priority: 'High',
    estWait: '5 min'
  },
  {
    id: 'm2',
    p1: { name: 'Sophie Bernard', points: 1210, club: 'Entente TT' },
    p2: { name: 'Camille Petit', points: 1195, club: 'AS Pontoise' },
    category: 'Dames - Poule B',
    priority: 'High',
    estWait: '8 min'
  },
  {
    id: 'm3',
    p1: { name: 'Thomas Leroy', points: 1620, club: 'Levallois LTT' },
    p2: { name: 'Maxime Moreau', points: 1590, club: 'AC Boulogne' },
    category: 'Open A - 1/8 Finale',
    priority: 'Medium',
    estWait: '12 min'
  },
  {
    id: 'm4',
    p1: { name: 'Julie Roux', points: 980, club: 'TT Montrouge' },
    p2: { name: 'Emma Fournier', points: 1020, club: 'US Créteil' },
    category: 'Dames - Poule A',
    priority: 'Medium',
    estWait: '15 min'
  },
  {
    id: 'm5',
    p1: { name: 'Nicolas Girard', points: 1350, club: 'Versailles TT' },
    p2: { name: 'Antoine Fontaine', points: 1310, club: 'Courbevoie TT' },
    category: 'Open B - Poule C',
    priority: 'Low',
    estWait: '20 min'
  },
  {
    id: 'm6',
    p1: { name: 'David Mercier', points: 1120, club: 'St Denis US' },
    p2: { name: 'Julien Blanc', points: 1150, club: 'Noisy Le Grand' },
    category: 'Open B - Poule D',
    priority: 'Low',
    estWait: '25 min'
  }
];

export const INITIAL_PLAYERS = [
  { id: 1, name: 'Lucas Martin', club: 'TT Paris XIII', pts: 1540, category: 'Open A', paid: true, played: 3 },
  { id: 2, name: 'Alexandre Dubois', club: 'US Métro', pts: 1485, category: 'Open A', paid: true, played: 2 },
  { id: 3, name: 'Sophie Bernard', club: 'Entente TT', pts: 1210, category: 'Dames', paid: true, played: 3 },
  { id: 4, name: 'Camille Petit', club: 'AS Pontoise', pts: 1195, category: 'Dames', paid: false, played: 2 },
  { id: 5, name: 'Thomas Leroy', club: 'Levallois LTT', pts: 1620, category: 'Open A', paid: true, played: 4 },
  { id: 6, name: 'Maxime Moreau', club: 'AC Boulogne', pts: 1590, category: 'Open A', paid: true, played: 3 },
  { id: 7, name: 'Julie Roux', club: 'TT Montrouge', pts: 980, category: 'Dames', paid: false, played: 1 },
  { id: 8, name: 'Emma Fournier', club: 'US Créteil', pts: 1020, category: 'Dames', paid: true, played: 2 },
  { id: 9, name: 'Nicolas Girard', club: 'Versailles TT', pts: 1350, category: 'Open B', paid: true, played: 2 },
  { id: 10, name: 'Antoine Fontaine', club: 'Courbevoie TT', pts: 1310, category: 'Open B', paid: false, played: 1 }
];

export const INITIAL_TABLES = [
  {
    id: 1,
    name: 'Table 1',
    status: 'EN COURS',
    match: {
      id: 't1_m',
      p1: { name: 'Marc Dupont', points: 1420, club: 'AC Boulogne' },
      p2: { name: 'Léo Lambert', points: 1380, club: 'TT Paris XIII' },
      category: 'Poule A - R2',
      elapsedSeconds: 878
    }
  },
  {
    id: 2,
    name: 'Table 2',
    status: 'EN COURS',
    match: {
      id: 't2_m',
      p1: { name: 'Hugo Clement', points: 1750, club: 'Levallois LTT' },
      p2: { name: 'Gabriel Roy', points: 1680, club: 'US Métro' },
      category: 'Open A - 1/16',
      elapsedSeconds: 420
    }
  },
  { id: 3, name: 'Table 3', status: 'DISPONIBLE', match: null },
  {
    id: 4,
    name: 'Table 4',
    status: 'EN COURS',
    match: {
      id: 't4_m',
      p1: { name: 'Sébastien Perrin', points: 1198, club: 'AS Pontoise' },
      p2: { name: 'Florian Bonnet', points: 1240, club: 'TT Montrouge' },
      category: 'Poule C - R1',
      elapsedSeconds: 1210
    }
  },
  { id: 5, name: 'Table 5', status: 'DISPONIBLE', match: null },
  {
    id: 6,
    name: 'Table 6',
    status: 'EN COURS',
    match: {
      id: 't6_m',
      p1: { name: 'Clara Michel', points: 1050, club: 'Entente TT' },
      p2: { name: 'Sarah François', points: 1110, club: 'US Créteil' },
      category: 'Dames - Poule C',
      elapsedSeconds: 310
    }
  },
  { id: 7, name: 'Table 7', status: 'DISPONIBLE', match: null },
  {
    id: 8,
    name: 'Table 8',
    status: 'EN COURS',
    match: {
      id: 't8_m',
      p1: { name: 'Mathieu Bertrand', points: 1890, club: 'Levallois LTT' },
      p2: { name: 'Paul Vincent', points: 1820, club: 'TT Paris XIII' },
      category: 'Open A - 1/8',
      elapsedSeconds: 1105
    }
  },
  { id: 9, name: 'Table 9', status: 'DISPONIBLE', match: null },
  { id: 10, name: 'Table 10', status: 'DISPONIBLE', match: null }
];

export const createEmptyScores = () => [
  { p1: '', p2: '' },
  { p1: '', p2: '' },
  { p1: '', p2: '' }
];
