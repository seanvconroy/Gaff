'use client';

import { Copy, Pencil, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { AccountMenu as AccountMenuRows } from '@/domain/navigation/account-menu';
import { AccountMenu } from '@/ui/AccountMenu';
import { type AddressOption, AddressSearch } from '@/ui/AddressSearch';
import { Button } from '@/ui/Button';
import { Chips } from '@/ui/Chips';
import { FilterChips } from '@/ui/FilterChips';
import { HeartButton } from '@/ui/HeartButton';
import { CodeInput } from '@/ui/CodeInput';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { Menu, MenuItem } from '@/ui/Menu';
import { OptionRow } from '@/ui/OptionRow';
import { PhotoUploader, type UploadedPhoto } from '@/ui/PhotoUploader';
import { type PlaceOption, PlaceSearch, type PlaceSuggestions } from '@/ui/PlaceSearch';
import { DateField, TimeField } from '@/ui/Pickers';
import { QuestionSteps } from '@/ui/QuestionSteps';
import { SearchBox } from '@/ui/SearchBox';
import { ListAndMap } from '@/ui/ListAndMap';
import { PinPicker } from '@/ui/PinPicker';
import { type MapPins, SearchMap } from '@/ui/SearchMap';
import { Sheet } from '@/ui/Sheet';
import { ToastProvider, useToast } from '@/ui/Toast';
import styles from './ui.module.css';

/** The parts of the component page that need a browser: things that open, move or announce. */

/** Light, dark, or whatever the device is set to: `data-theme` on the page overrides the device. */
export function ThemeSwitch() {
  return (
    <Chips
      name="theme"
      legend="Theme"
      defaultValue="system"
      options={[
        { value: 'system', label: 'As this device' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ]}
      onChange={(event) => {
        const theme = event.target.value;
        if (theme === 'system') document.documentElement.removeAttribute('data-theme');
        else document.documentElement.setAttribute('data-theme', theme);
      }}
    />
  );
}

export function SheetDemo() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState('');
  return (
    <div className={styles.row}>
      <Button onClick={() => setOpen(true)}>Change the viewing time</Button>
      {saved ? <p role="status">Moved to {saved}.</p> : null}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Change the viewing time"
        description="12 Ranelagh Road. Everyone booked is told straight away."
        footer={
          <>
            <Button
              variant="primary"
              fullWidth="phone"
              onClick={() => {
                setSaved('6:30pm');
                setOpen(false);
              }}
            >
              Save the new time
            </Button>
            <Button variant="quiet" fullWidth="phone" onClick={() => setOpen(false)}>
              Keep it as it is
            </Button>
          </>
        }
      >
        <TextField
          name="sheet-note"
          label="A line for the people booked"
          hint="It goes in the email that tells them."
          optional
        />
      </Sheet>
    </div>
  );
}

export function MenuDemo() {
  const [chosen, setChosen] = useState('');
  return (
    <div className={styles.row}>
      <Menu label="More for 12 Ranelagh Road" align="start">
        <MenuItem icon={Pencil} onSelect={() => setChosen('Edit the home')}>
          Edit the home
        </MenuItem>
        <MenuItem icon={Share2} onSelect={() => setChosen('Share with the owner')}>
          Share with the owner
        </MenuItem>
        <MenuItem icon={Copy} href="#menu">
          Let it again
        </MenuItem>
        <MenuItem icon={Trash2} destructive onSelect={() => setChosen('Withdraw this letting')}>
          Withdraw this letting
        </MenuItem>
      </Menu>
      {chosen ? <p role="status">You chose: {chosen}.</p> : null}
    </div>
  );
}

/** The account menu on the avatar, as the navigation shows it. Nothing in it does anything here. */
export function AccountMenuDemo({ menu }: { menu: AccountMenuRows }) {
  const nothing = async () => undefined;
  return (
    <AccountMenu menu={menu} actions={{ signOut: nothing, switchTo: nothing, add: nothing }} />
  );
}

function ToastButtons() {
  const toast = useToast();
  const [removed, setRemoved] = useState(false);
  return (
    <div className={styles.stack}>
      <div className={styles.row}>
        <Button onClick={() => toast.show({ message: 'Saved' })}>Save</Button>
        <Button
          onClick={() => {
            setRemoved(true);
            toast.show({ message: 'Viewing time removed', undo: () => setRemoved(false) });
          }}
        >
          Remove a viewing time
        </Button>
      </div>
      <p className={styles.muted}>
        {removed
          ? 'Tuesday 24 November, 11am is removed. Undo is offered for ten seconds.'
          : 'Tuesday 24 November, 11am is in the calendar.'}
      </p>
    </div>
  );
}

export function ToastDemo() {
  return (
    <ToastProvider>
      <ToastButtons />
    </ToastProvider>
  );
}

export function PickerDemos() {
  const [date, setDate] = useState('');
  return (
    <div className={styles.fields}>
      <DateField
        name="demo-date"
        label="Viewing date"
        hint={date ? `The form is sent ${date}.` : 'Nothing chosen yet.'}
        value={date}
        onChange={setDate}
        min="2026-11-16"
        max="2027-01-31"
      />
      <DateField name="demo-date-chosen" label="Available from" defaultValue="2026-12-15" />
      <DateField
        name="demo-date-error"
        label="Pay by"
        error="Choose a date to pay by, on or before the day the tenancy starts."
      />
      <TimeField name="demo-time" label="From" from="08:00" until="21:00" />
      <TimeField name="demo-time-chosen" label="Until" defaultValue="18:30" stepMinutes={15} />
    </div>
  );
}

export function CodeDemo() {
  const [sent, setSent] = useState('');
  return (
    <div className={styles.fields}>
      <CodeInput
        name="demo-code"
        label="Enter the 6-digit code"
        hint="We sent it to ann@halcyon.test. It works for 10 minutes."
        onComplete={setSent}
      />
      <p role="status" className={styles.muted}>
        {sent
          ? `Sent ${sent} without a button.`
          : 'When the sixth digit goes in, the code sends itself.'}
      </p>
      <CodeInput
        name="demo-code-error"
        label="Enter the 6-digit code (wrong code)"
        defaultValue="481"
        error="That code isn’t right. Check the email and try again."
      />
    </div>
  );
}

/** Made-up addresses: the component page looks nothing up. */
const demoAddresses: AddressOption[] = [
  { id: 'a', label: '12 Ranelagh Road, Ranelagh, Dublin 6, D06 F2X3' },
  { id: 'b', label: '14 Ranelagh Road, Ranelagh, Dublin 6, D06 F2X5' },
  { id: 'c', label: '22 Harbour Row, Cobh, P24 H9W3' },
];
const findDemoAddresses = async (query: string) =>
  demoAddresses.filter((each) => each.label.toLowerCase().includes(query.toLowerCase()));

/** Address search: type three letters ("ran"), or something that isn't there ("zzz"). */
export function AddressSearchDemo() {
  const [picked, setPicked] = useState('');
  return (
    <div className={styles.fields}>
      <AddressSearch
        name="ui-address-search"
        label="Eircode or address"
        search={findDemoAddresses}
        notFound="We can’t find that. Check the Eircode, or enter the address yourself."
        onPick={(option) => setPicked(option.label)}
      />
      <AddressSearch
        name="ui-address-search-error"
        label="Eircode or address"
        search={findDemoAddresses}
        notFound="We can’t find that. Check the Eircode, or enter the address yourself."
        error="Choose an address from the list, or enter it yourself"
        onPick={(option) => setPicked(option.label)}
      />
      <p role="status">{picked ? `Picked: ${picked}` : ''}</p>
    </div>
  );
}

const demoPlaces: Array<PlaceOption & { group: string }> = [
  {
    group: 'Places',
    id: 'kinsale',
    name: 'Kinsale',
    label: 'Kinsale, Co. Cork',
    description: 'Town in County Cork · 4 homes',
    icon: 'place',
  },
  {
    group: 'Places',
    id: 'kinsealy',
    name: 'Kinsealy',
    label: 'Kinsealy, Co. Dublin',
    description: 'Village in County Dublin',
    icon: 'place',
  },
  {
    group: 'Streets',
    id: 'kinsale-road-ballyphehane-cork',
    name: 'Kinsale Road',
    label: 'Near Kinsale Road, Ballyphehane',
    description: 'Ballyphehane, Cork',
    icon: 'street',
  },
  {
    group: 'Landmarks',
    id: 'heuston-station-dublin-8',
    name: 'Heuston Station',
    label: 'Near Heuston Station, Dublin 8',
    description: 'Dublin 8',
    icon: 'station',
  },
];

/** A stand-in for Gaff's place index: "kins" finds places and a street; "kinsael" a near one. */
async function findDemoPlaces(query: string): Promise<PlaceSuggestions> {
  const typed = query.trim().toLowerCase();
  const group = (label: string, options: PlaceOption[]) => ({ label, options });
  if (!typed) return { groups: [group('Places with homes', [demoPlaces[0]!])], didYouMean: false };
  if (typed === 'kinsael') return { groups: [group('Places', [demoPlaces[0]!])], didYouMean: true };
  const found = demoPlaces.filter((p) => p.name.toLowerCase().startsWith(typed));
  const labels = [...new Set(found.map((p) => p.group))];
  return {
    groups: labels.map((label) =>
      group(
        label,
        found.filter((p) => p.group === label),
      ),
    ),
    didYouMean: false,
  };
}

/** Place search: focus it, type "kins", or a near spelling ("kinsael"). */
export function PlaceSearchDemo() {
  const [picked, setPicked] = useState('');
  return (
    <div className={styles.fields}>
      <PlaceSearch
        name="ui-place-search"
        label="Where"
        suggest={findDemoPlaces}
        onPick={(option) => setPicked(option.label)}
        notFound={(typed) => `We couldn’t find ‘${typed}’.`}
        didYouMeanLabel="Did you mean"
        foundWords={(count) => (count === 1 ? '1 place found' : `${count} places found`)}
        credit={{ text: 'Places from OpenStreetMap', href: '/map-and-place-data' }}
      />
      <p role="status">{picked ? `Picked: ${picked}` : ''}</p>
    </div>
  );
}

/** Option rows: off, on with its one value, and a plain yes or no. */
export function OptionRowDemo() {
  return (
    <div className={styles.fields}>
      <OptionRow
        name="ui-option-people"
        label="Most people"
        hint="The most people who can live there"
        defaultOn
      >
        <TextField
          name="ui-option-people-value"
          label="Most people who can live there"
          width="short"
          inputMode="numeric"
          defaultValue="3"
        />
      </OptionRow>
      <OptionRow
        name="ui-option-stay"
        label="Length of stay"
        hint="For people who plan to stay at least this long"
      >
        <TextField name="ui-option-stay-value" label="Months" width="short" />
      </OptionRow>
      <OptionRow
        name="ui-option-pets"
        label="No pets"
        hint="Assistance dogs are always welcome. They never count as pets."
        defaultOn
      />
    </div>
  );
}

/** A square of one colour, as a picture: the component page stores nothing. */
const swatch = (colour: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="${colour}"/></svg>`,
  )}`;
const demoPhotos: UploadedPhoto[] = [
  { id: 'front', href: swatch('#2f5d9b') },
  { id: 'kitchen', href: swatch('#c98c3c') },
  { id: 'garden', href: swatch('#5a8c5a') },
  { id: 'plan', href: swatch('#ffffff'), kind: 'floor_plan' },
];

/**
 * Photo uploader: three photos and a floor plan (M44) to reorder, mark and remove, and room for
 * more. A photo added here is shown from the browser's own memory; one named "fail" doesn't
 * upload, to show that tile.
 */
export function PhotoUploaderDemo() {
  return (
    <PhotoUploader
      photos={demoPhotos}
      max={30}
      upload={async (data) => {
        const file = data.get('photo');
        if (!(file instanceof File) || file.name.includes('fail')) {
          return { ok: false, message: 'That photo is too big. Try one under 4 MB.' };
        }
        return {
          ok: true,
          photo: { id: `added-${Date.now()}`, href: swatch('#8a8a8a') },
        };
      }}
      remove={async () => undefined}
      reorder={async () => undefined}
      setKind={async () => undefined}
    />
  );
}

/** Questions one per screen: two made-up ones, sent nowhere. */
export function QuestionStepsDemo() {
  const need = (field: string) => (values: Readonly<Record<string, string>>) =>
    values[field] ? {} : ({ [field]: 'Choose one to carry on' } as Record<string, string>);
  return (
    <QuestionSteps
      label="A few quick questions"
      action={() => {}}
      defaults={{}}
      submit="Send my answers"
      pending="Sending…"
      steps={[
        {
          id: 'people',
          name: 'People',
          title: 'How many people would live here, including you?',
          lead: 'Halcyon Lettings asks everyone the same questions.',
          fields: ['demoPeople'],
          check: need('demoPeople'),
          content: ({ errors }) => (
            <ChoiceGroup
              name="demoPeople"
              legend="How many people would live here, including you?"
              hideLegend
              inline="pairs"
              error={errors.demoPeople}
              options={['1', '2', '3', '4', '5', '6 or more'].map((label) => ({
                value: label,
                label,
              }))}
            />
          ),
        },
        {
          id: 'pets',
          name: 'Pets',
          title: 'Do you have any pets?',
          fields: ['demoPets'],
          check: need('demoPets'),
          content: ({ errors }) => (
            <ChoiceGroup
              name="demoPets"
              legend="Do you have any pets?"
              hideLegend
              hint="Assistance dogs don’t count as pets."
              inline
              error={errors.demoPets}
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
            />
          ),
        },
      ]}
    />
  );
}

/**
 * The search box with chips (WP-21): the box, "Filters", and a chip per filter understood. The
 * demo's form goes nowhere; pressing a chip says which one. The heart is shown off and on.
 */
export function SearchBoxDemo() {
  return (
    <ToastProvider>
      <SearchBoxParts />
    </ToastProvider>
  );
}

function SearchBoxParts() {
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  return (
    <div className={styles.fields}>
      <SearchBox
        id="ui-search-question"
        question="What are you looking for?"
        placeholder="2-bed in Ranelagh, no pets"
        submitLabel="Search"
        action="#search-box"
        primary={false}
      >
        <FilterChips
          label="What Gaff understood"
          filtersLabel="Filters"
          chips={[
            { key: 'where', label: 'Ranelagh, Dublin 6' },
            { key: 'beds', label: '2 bedrooms' },
            { key: 'maxRent', label: 'Up to €2,400 a month' },
            { key: 'pets', label: 'No pets' },
          ]}
          onFilters={() => toast.show({ message: 'Filters pressed' })}
          onChip={(key) => toast.show({ message: `Chip pressed: ${key}` })}
        />
      </SearchBox>
      <div className={styles.row}>
        <HeartButton label="Save 2-bed apartment · Ranelagh, Dublin 6" onPress={() => {}} />
        <HeartButton
          label="Save 1-bed apartment · Rathmines, Dublin 6"
          saved={saved}
          onPress={() => setSaved((now) => !now)}
        />
      </div>
    </div>
  );
}

const demoPin = { lat: 53.3263, lng: -6.2563 };
const demoPinWords = {
  label: 'Map for placing the home’s pin',
  pin: 'The home’s pin',
  keyboard:
    'With the pin selected, the arrow keys move it about 10 metres. Hold Shift to move it 50.',
  movesLabel: 'Move the pin a step',
  moves: {
    north: 'Move the pin up',
    south: 'Move the pin down',
    west: 'Move the pin left',
    east: 'Move the pin right',
  },
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  standIn: 'Test map: not Google Maps',
};

/** M38: the pin picker, on the stand-in map, with a made-up street. */
export function PinPickerDemo() {
  const [point, setPoint] = useState(demoPin);
  return (
    <div className={styles.fields}>
      <PinPicker
        settings={{ provider: 'static' }}
        point={point}
        close
        streets={[
          {
            name: 'Example Road',
            line: [
              [
                { lat: 53.3258, lng: -6.2583 },
                { lat: 53.3268, lng: -6.2543 },
              ],
            ],
          },
        ]}
        words={demoPinWords}
        onMove={setPoint}
        onFailed={() => undefined}
      />
      <p role="status">
        {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
      </p>
    </div>
  );
}

const demoPins: MapPins = {
  points: [
    {
      id: 'aaaaaaaaaaaa',
      lat: 53.3263,
      lng: -6.2563,
      rentCents: 225_000,
      title: '2-bed apartment',
    },
    {
      id: 'bbbbbbbbbbbb',
      lat: 53.3238,
      lng: -6.2585,
      rentCents: 195_000,
      title: '1-bed apartment',
    },
    { id: 'cccccccccccc', lat: 53.3238, lng: -6.2585, rentCents: 210_000, title: '2-bed duplex' },
  ],
  pinned: 3,
  listed: 4,
};

// The map takes each of these as a dependency, so they are the same function on every render,
// as on the search page: a new one would start the map loading again when a pin is pointed at.
const demoArea = {
  kind: 'place',
  slug: 'example',
  box: { minLat: 53.32, minLng: -6.265, maxLat: 53.33, maxLng: -6.25 },
} as const;
const loadDemoPins = async () => demoPins;
const loadDemoCard = async (id: string) => ({
  id,
  href: '#',
  title: '€2,250 a month',
  line: '2-bed apartment · Example, Dublin',
  free: 'Free now',
  photo: null,
});
const nothing = () => undefined;
const demoOpenKind = () => 'larger' as const;

/** M57, M117: the search map and its list, on the stand-in, with made-up pins. */
export function SearchMapDemo() {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <ListAndMap
      words={{ showMap: 'Map', showList: 'List' }}
      list={<p>The list of homes sits here, complete without the map.</p>}
      map={
        <div className={styles.mapDemo}>
          <SearchMap
            settings={{ provider: 'static' }}
            area={demoArea}
            loadPins={loadDemoPins}
            loadCard={loadDemoCard}
            onSearchArea={nothing}
            hovered={hovered}
            onHover={setHovered}
            count={nothing}
            openKind={demoOpenKind}
          />
        </div>
      }
    />
  );
}
