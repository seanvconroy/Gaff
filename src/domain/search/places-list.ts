import type { County } from './places';

/**
 * UX-SR-5: Gaff's own list of Irish places, which "Where" is matched against. Nothing typed into
 * a search is sent to a map or address provider (rule 10).
 *
 * THIS IS THE HAND-MADE LIST. The full one is built from OpenStreetMap by
 * `scripts/places/build-places.ts`, which this environment couldn't run: its network blocks
 * OpenStreetMap's servers. This list covers every county, the cities, the large towns, every
 * Dublin postal district and the best-known neighbourhoods. Place names are facts, not anyone's
 * data; where the full list is used, it is credited "© OpenStreetMap contributors" (ODbL).
 *
 * Each county lists its towns, then its neighbourhoods as `[name, context]` ("Ranelagh" in
 * "Dublin 6"). A name marked `cue` is also an everyday word or a first name ("Clare", "Rush"),
 * so a sentence only names it as a place after "in", "near", "around", "at" or "County".
 */
export interface ListedPlace {
  name: string;
  aliases?: readonly string[];
  cue?: boolean;
  /** Where it is, for a neighbourhood: "Dublin 6", "Cork". */
  context?: string;
}

const t = (name: string, extra: Omit<ListedPlace, 'name'> = {}): ListedPlace => ({
  name,
  ...extra,
});

export const countyPlaces: Record<
  County,
  {
    aliases?: readonly string[];
    cue?: boolean;
    towns: readonly ListedPlace[];
    areas?: readonly ListedPlace[];
  }
> = {
  Carlow: { towns: [t('Tullow'), t('Bagenalstown', { aliases: ['muine bheag'] })] },
  Cavan: { towns: [t('Bailieborough'), t('Cootehill'), t('Belturbet')] },
  Clare: {
    cue: true,
    towns: [t('Ennis'), t('Shannon', { cue: true }), t('Kilrush'), t('Kilkee'), t('Lahinch')],
  },
  Cork: {
    towns: [
      t('Ballincollig'),
      t('Carrigaline'),
      t('Cobh'),
      t('Midleton'),
      t('Mallow'),
      t('Youghal'),
      t('Bandon'),
      t('Kinsale'),
      t('Fermoy'),
      t('Macroom'),
      t('Clonakilty'),
      t('Skibbereen'),
      t('Bantry'),
      t('Mitchelstown'),
      t('Glanmire'),
      t('Passage West'),
    ],
    areas: [
      t('Douglas', { cue: true, context: 'Cork' }),
      t('Bishopstown', { context: 'Cork' }),
      t('Wilton', { context: 'Cork' }),
      t('Ballinlough', { context: 'Cork' }),
      t('Togher', { context: 'Cork' }),
      t('Mahon', { cue: true, context: 'Cork' }),
      t('Montenotte', { context: 'Cork' }),
      t('Blackpool', { context: 'Cork' }),
    ],
  },
  Donegal: {
    towns: [t('Letterkenny'), t('Buncrana'), t('Ballyshannon'), t('Bundoran')],
  },
  Dublin: {
    towns: [
      t('Swords'),
      t('Malahide'),
      t('Balbriggan'),
      t('Skerries'),
      t('Rush', { cue: true }),
      t('Lusk'),
      t('Donabate'),
      t('Portmarnock'),
      t('Lucan'),
      t('Saggart'),
      t('Rathcoole'),
      t('Dún Laoghaire', { aliases: ['dun laoire', 'dunlaoghaire'] }),
      t('Blackrock'),
      t('Dalkey'),
      t('Killiney'),
      t('Stillorgan'),
      t('Glenageary'),
      t('Monkstown'),
      t('Booterstown'),
      t('Mount Merrion'),
      t('Sallynoggin'),
    ],
    areas: [
      t('Ranelagh', { context: 'Dublin 6' }),
      t('Rathmines', { context: 'Dublin 6' }),
      t('Rathgar', { context: 'Dublin 6' }),
      t('Milltown', { context: 'Dublin 6' }),
      t('Harold’s Cross', { aliases: ['harolds cross'], context: 'Dublin 6W' }),
      t('Terenure', { context: 'Dublin 6W' }),
      t('Templeogue', { context: 'Dublin 6W' }),
      t('Kimmage', { context: 'Dublin 12' }),
      t('Temple Bar', { context: 'Dublin 2' }),
      t('Grand Canal Dock', { aliases: ['grand canal'], context: 'Dublin 2' }),
      t('Docklands', { context: 'Dublin 1' }),
      t('Clontarf', { context: 'Dublin 3' }),
      t('Fairview', { context: 'Dublin 3' }),
      t('Marino', { cue: true, context: 'Dublin 3' }),
      t('East Wall', { context: 'Dublin 3' }),
      t('North Strand', { context: 'Dublin 3' }),
      t('Sandymount', { context: 'Dublin 4' }),
      t('Ballsbridge', { context: 'Dublin 4' }),
      t('Donnybrook', { context: 'Dublin 4' }),
      t('Ringsend', { context: 'Dublin 4' }),
      t('Irishtown', { context: 'Dublin 4' }),
      t('Raheny', { context: 'Dublin 5' }),
      t('Artane', { context: 'Dublin 5' }),
      t('Kilbarrack', { context: 'Dublin 5' }),
      t('Stoneybatter', { context: 'Dublin 7' }),
      t('Smithfield', { context: 'Dublin 7' }),
      t('Phibsborough', { aliases: ['phibsboro'], context: 'Dublin 7' }),
      t('Cabra', { context: 'Dublin 7' }),
      t('Portobello', { context: 'Dublin 8' }),
      t('Rialto', { context: 'Dublin 8' }),
      t('Inchicore', { context: 'Dublin 8' }),
      t('Kilmainham', { context: 'Dublin 8' }),
      t('Islandbridge', { context: 'Dublin 8' }),
      t('The Liberties', { aliases: ['liberties'], context: 'Dublin 8' }),
      t('Dolphin’s Barn', { aliases: ['dolphins barn'], context: 'Dublin 8' }),
      t('Drumcondra', { context: 'Dublin 9' }),
      t('Glasnevin', { context: 'Dublin 9' }),
      t('Whitehall', { context: 'Dublin 9' }),
      t('Santry', { context: 'Dublin 9' }),
      t('Beaumont', { context: 'Dublin 9' }),
      t('Ballymun', { context: 'Dublin 9' }),
      t('Ballyfermot', { context: 'Dublin 10' }),
      t('Finglas', { context: 'Dublin 11' }),
      t('Crumlin', { context: 'Dublin 12' }),
      t('Drimnagh', { context: 'Dublin 12' }),
      t('Walkinstown', { context: 'Dublin 12' }),
      t('Howth', { context: 'Dublin 13' }),
      t('Sutton', { cue: true, context: 'Dublin 13' }),
      t('Baldoyle', { context: 'Dublin 13' }),
      t('Donaghmede', { context: 'Dublin 13' }),
      t('Rathfarnham', { context: 'Dublin 14' }),
      t('Churchtown', { context: 'Dublin 14' }),
      t('Dundrum', { context: 'Dublin 14' }),
      t('Castleknock', { context: 'Dublin 15' }),
      t('Blanchardstown', { context: 'Dublin 15' }),
      t('Clonsilla', { context: 'Dublin 15' }),
      t('Ongar', { context: 'Dublin 15' }),
      t('Ballinteer', { context: 'Dublin 16' }),
      t('Knocklyon', { context: 'Dublin 16' }),
      t('Coolock', { context: 'Dublin 17' }),
      t('Sandyford', { context: 'Dublin 18' }),
      t('Foxrock', { context: 'Dublin 18' }),
      t('Cabinteely', { context: 'Dublin 18' }),
      t('Leopardstown', { context: 'Dublin 18' }),
      t('Shankill', { context: 'Dublin 18' }),
      t('Chapelizod', { context: 'Dublin 20' }),
      t('Palmerstown', { context: 'Dublin 20' }),
      t('Clondalkin', { context: 'Dublin 22' }),
      t('Tallaght', { context: 'Dublin 24' }),
      t('Firhouse', { context: 'Dublin 24' }),
    ],
  },
  Galway: {
    towns: [
      t('Oranmore'),
      t('Tuam'),
      t('Ballinasloe'),
      t('Loughrea'),
      t('Athenry'),
      t('Clifden'),
      t('Oughterard'),
    ],
    areas: [t('Salthill', { context: 'Galway' }), t('Knocknacarra', { context: 'Galway' })],
  },
  Kerry: {
    cue: true,
    towns: [
      t('Tralee'),
      t('Killarney'),
      t('Listowel'),
      t('Kenmare'),
      t('Dingle'),
      t('Castleisland'),
    ],
  },
  Kildare: {
    towns: [
      t('Naas'),
      t('Newbridge'),
      t('Celbridge'),
      t('Maynooth'),
      t('Leixlip'),
      t('Athy'),
      t('Kilcock'),
      t('Clane'),
      t('Sallins'),
      t('Monasterevin'),
    ],
  },
  Kilkenny: { towns: [t('Thomastown'), t('Callan', { cue: true })] },
  Laois: {
    towns: [
      t('Portlaoise', { aliases: ['port laoise'] }),
      t('Portarlington'),
      t('Mountmellick'),
      t('Abbeyleix'),
    ],
  },
  Leitrim: { towns: [t('Carrick-on-Shannon', { aliases: ['carrick'] }), t('Mohill')] },
  Limerick: {
    towns: [t('Newcastle West'), t('Abbeyfeale'), t('Kilmallock'), t('Adare')],
    areas: [t('Castletroy', { context: 'Limerick' })],
  },
  Longford: { towns: [t('Granard')] },
  Louth: { towns: [t('Drogheda'), t('Dundalk'), t('Ardee'), t('Carlingford')] },
  Mayo: {
    towns: [t('Castlebar'), t('Ballina'), t('Westport'), t('Claremorris'), t('Ballinrobe')],
  },
  Meath: {
    towns: [
      t('Navan'),
      t('Trim', { cue: true }),
      t('Ashbourne'),
      t('Ratoath'),
      t('Dunboyne'),
      t('Kells'),
      t('Laytown'),
      t('Bettystown'),
      t('Dunshaughlin'),
      t('Enfield'),
    ],
  },
  Monaghan: {
    towns: [t('Carrickmacross'), t('Castleblayney'), t('Clones', { cue: true })],
  },
  Offaly: { towns: [t('Tullamore'), t('Birr'), t('Edenderry')] },
  Roscommon: { towns: [t('Boyle', { cue: true }), t('Castlerea')] },
  Sligo: { towns: [t('Strandhill'), t('Tubbercurry')] },
  Tipperary: {
    towns: [
      t('Clonmel'),
      t('Nenagh'),
      t('Thurles'),
      t('Carrick-on-Suir'),
      t('Cashel'),
      t('Roscrea'),
      t('Cahir'),
    ],
  },
  Waterford: { towns: [t('Tramore'), t('Dungarvan'), t('Lismore')] },
  Westmeath: { towns: [t('Athlone'), t('Mullingar'), t('Moate')] },
  Wexford: { towns: [t('Enniscorthy'), t('Gorey'), t('New Ross')] },
  Wicklow: {
    towns: [
      t('Bray'),
      t('Greystones'),
      t('Arklow'),
      t('Blessington'),
      t('Rathdrum'),
      t('Newtownmountkennedy'),
    ],
  },
};

/**
 * The Dublin postal districts, with the routing key of their Eircodes. There is no Dublin 19,
 * 21 or 23.
 */
export const dublinDistricts = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '6W',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '20',
  '22',
  '24',
] as const;
