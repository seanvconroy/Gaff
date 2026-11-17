import {
  Building2,
  CalendarClock,
  ClipboardList,
  House,
  KeyRound,
  MessagesSquare,
  Plus,
  Send,
  Sparkles,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { env } from '@/lib/env';
import { typeStyles } from '@/styles/tokens';
import { ActionCard } from '@/ui/ActionCard';
import { ActionList, ActionRow } from '@/ui/ActionList';
import { Avatar, Badge } from '@/ui/Avatar';
import { Button, ButtonLink } from '@/ui/Button';
import { Calendar } from '@/ui/Calendar';
import { ChipLinks, Chips } from '@/ui/Chips';
import { weekLabel, weekOf } from '@/ui/dates';
import { ChoiceCards } from '@/ui/ChoiceCards';
import { CopyButton } from '@/ui/CopyButton';
import { Disclosure } from '@/ui/Disclosure';
import { EmptyState } from '@/ui/EmptyState';
import { ChoiceGroup, SelectField, TextArea, TextField } from '@/ui/Field';
import { FormActions, formClass } from '@/ui/Form';
import { Gallery } from '@/ui/Gallery';
import { HomeCard, HomeGrid } from '@/ui/HomeCard';
import { Card, CardHeader } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { MessagePreview } from '@/ui/MessagePreview';
import { Outcome } from '@/ui/Outcome';
import { PersonCard, PersonCards } from '@/ui/PersonCard';
import { PickList } from '@/ui/PickList';
import { ShowMore } from '@/ui/ShowMore';
import { SegmentedProgress } from '@/ui/SegmentedProgress';
import { Skeleton, SkeletonGroup } from '@/ui/Skeleton';
import { DraftedByAi, StatusPill } from '@/ui/StatusPill';
import { StepCard } from '@/ui/StepCard';
import { SummaryList } from '@/ui/SummaryList';
import { Cell, Table } from '@/ui/Table';
import {
  ConversationList,
  ConversationRow,
  DraftGap,
  DraftText,
  OpenConversation,
  ReplyBox,
  Thread,
  ThreadHeader,
  ThreadLayout,
  ThreadMessage,
} from '@/ui/Thread';
import { Wordmark, WordmarkImage } from '@/ui/Wordmark';
import { DirectionsLink } from '@/ui/DirectionsLink';
import { DocumentView } from '@/ui/Document';
import { NumberedSteps } from '@/ui/NumberedSteps';
import { StepList } from '@/ui/StepList';
import { SetupChecklist } from '@/ui/SetupChecklist';
import { Prompt } from '@/ui/Prompt';
import { TimePicker } from '@/ui/TimePicker';
import {
  AddressSearchDemo,
  SearchBoxDemo,
  CodeDemo,
  MenuDemo,
  OptionRowDemo,
  PhotoUploaderDemo,
  PickerDemos,
  QuestionStepsDemo,
  SheetDemo,
  ThemeSwitch,
  ToastDemo,
} from './Demos';
import styles from './ui.module.css';

export const metadata: Metadata = { title: 'Components' };
export const dynamic = 'force-dynamic';

const colours = [
  ['surface0', 'surface-0', 'The page'],
  ['surface2', 'surface-2', 'Quiet fills'],
  ['ink', 'ink', 'Text, and the main button'],
  ['inkMuted', 'ink-muted', 'Secondary text'],
  ['border', 'border', 'Hairlines'],
  ['borderStrong', 'border-strong', 'Edges of controls'],
  ['brand', 'brand', 'The accent: Atlantic blue'],
  ['brandBg', 'brand-bg', 'Behind a selected choice'],
  ['success', 'success', 'Done'],
  ['successBg', 'success-bg', 'Its tint'],
  ['warning', 'warning', 'Needs attention'],
  ['warningBg', 'warning-bg', 'Its tint'],
  ['danger', 'danger', 'Something went wrong'],
  ['dangerBg', 'danger-bg', 'Its tint'],
  ['info', 'info', 'Information'],
  ['infoBg', 'info-bg', 'Its tint'],
] as const;

/** A made-up cover photo for the examples: a drawing, so the page needs no picture of a real home. */
const samplePhoto = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">' +
    '<rect width="300" height="200" fill="#cfd8e6"/>' +
    '<rect y="140" width="300" height="60" fill="#8a97ab"/>' +
    '<path d="M90 140V85l60-40 60 40v55z" fill="#f4f5f7"/>' +
    '<rect x="138" y="105" width="24" height="35" fill="#3a5fa8"/>' +
    '</svg>',
)}`;

const typeSamples: Record<(typeof typeStyles)[number], string> = {
  display: '12 Ranelagh Road',
  'display-mobile': 'Choose a viewing time',
  title: 'Who should view?',
  heading: 'Viewing on Thursday 12 November, 6pm',
  body: 'Thanks for your interest. We’ll be in touch by Friday either way.',
  'body-sm': 'Enquired 2 hours ago via Daft',
  label: 'Viewing booked',
  caption: 'Deleted automatically on 14 December',
};

const parts = ['Set up', 'Viewings', 'Choosing', 'Tenancy'];
const steps = [
  'Address',
  'Rent',
  'The home',
  'Photos',
  'Details',
  'Criteria',
  'Rent check',
  'Go live',
];

function Section({ id, title, lead, children }: SectionProps) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <div className={styles.sectionHead}>
        <h2 id={id} className="type-title">
          {title}
        </h2>
        {lead ? <p className={styles.muted}>{lead}</p> : null}
      </div>
      {children}
    </section>
  );
}

interface SectionProps {
  id: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}

function Example({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.example}>
      <p className={styles.exampleLabel}>{label}</p>
      {children}
    </div>
  );
}

/** Made-up conversations for the thread examples: one waiting, one answered, one with an owner. */
function SampleConversations({ label, current }: { label: string; current?: boolean }) {
  return (
    <ConversationList label={label}>
      <ConversationRow
        href="#thread"
        who="Aoife"
        home="12 Ranelagh Road"
        lastLine="Hi, is it furnished? Is there a garden?"
        when="9:20am"
        status={<StatusPill tone="info">Needs you</StatusPill>}
        current={current}
      />
      <ConversationRow
        href="#thread"
        who="Ciarán"
        home="12 Ranelagh Road"
        lastLine="Gaff: Thanks for your enquiry about 12 Ranelagh Road."
        when="Yesterday"
      />
      <ConversationRow
        href="#thread"
        who="Tom"
        role="Owner"
        home="4 Rathmines Close"
        lastLine="You: Two viewings are booked for Saturday."
        when="Tuesday"
        status={<StatusPill>Waiting for Niamh</StatusPill>}
      />
    </ConversationList>
  );
}

/**
 * Development only (DEV_TOOLS=1): every component of the design system and its states, on one
 * page, at whatever width the window is (work package WP-2). The words are made up.
 */
export default function ComponentsPage() {
  if (!env().DEV_TOOLS) notFound();
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Wordmark href="/dev/ui" />
        <ThemeSwitch />
      </header>
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1 className={`${styles.title} type-display`}>Components</h1>
          <p className={styles.lead}>
            Ink on white, one blue, one type family and one control height. Narrow the window to see
            each component’s phone layout: there are two, either side of 900px.
          </p>
          <p>
            <Link href="/dev/ui/flow">See the flow shell, the frame of a step-by-step task</Link>
          </p>
          <p>
            <Link href="/dev/ui/nav">See the navigation: the top bar and the tab bar</Link>
          </p>
          <p>
            <Link href="/dev/ui/frame">
              See the frame of a private page, for a renter, an owner and a referee
            </Link>
          </p>
          <p>
            <Link href="/dev/ui/renter">See every page a renter or a tenant can see</Link>
          </p>
        </div>

        <Section
          id="wordmark"
          title="Wordmark"
          lead="A drawing made from the lettering itself. The two f’s meet and read as a key; the full stop is the brand colour."
        >
          <div className={styles.row}>
            <Example label="Regular">
              <WordmarkImage />
            </Example>
            <Example label="Small, 20px high">
              <WordmarkImage size="small" />
            </Example>
          </div>
        </Section>

        <Section
          id="colour"
          title="Colour"
          lead="The page is white. Fills use one grey. The blue marks what belongs to Gaff: selection, progress, links and the assistant’s work."
        >
          <ul className={styles.swatches}>
            {colours.map(([className, token, use]) => (
              <li key={token} className={styles.swatch}>
                <span className={`${styles.chip} ${styles[className]}`} />
                <span className={styles.swatchText}>
                  <code className={styles.token}>{token}</code>
                  <span className={styles.muted}>{use}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="type" title="Type" lead="DM Sans for everything on screen.">
          <dl className={styles.typeList}>
            {typeStyles.map((style) => (
              <div key={style} className={styles.typeRow}>
                <dt className={styles.token}>{style}</dt>
                <dd className={`${styles.typeSample} type-${style}`}>{typeSamples[style]}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section
          id="buttons"
          title="Button"
          lead="48px high everywhere. Primary is ink, and a real screen has one."
        >
          <div className={styles.row}>
            <Button variant="primary">Send invitations</Button>
            <Button variant="secondary">Add a time</Button>
            <Button variant="quiet">Not now</Button>
            <Button variant="destructive">
              <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
              Remove from the team
            </Button>
          </div>
          <div className={styles.row}>
            <ButtonLink href="#buttons" variant="primary">
              <Plus size={20} strokeWidth={2} aria-hidden="true" />
              Add a letting
            </ButtonLink>
            <Button variant="primary" disabled>
              Sending…
            </Button>
            <CopyButton value="IE29 AIBK 9311 5212 3456 78" what="the IBAN" />
          </div>
          <Example label="At the foot of a task: full width on a phone, sized to its label on a desktop">
            <div className={styles.row}>
              <Button variant="primary" fullWidth="phone">
                <Send size={20} strokeWidth={1.75} aria-hidden="true" />
                Book this time
              </Button>
            </div>
          </Example>
        </Section>

        <Section
          id="fields"
          title="Field"
          lead="The label, the control, then the error, then the help. One height; three widths: short, medium and the full column."
        >
          <div className={styles.fields}>
            <TextField name="ui-address" label="Address" defaultValue="12 Ranelagh Road" />
            <TextField
              name="ui-licence"
              label="PSRA licence number"
              width="medium"
              hint="Six digits, on your licence."
              inputMode="numeric"
            />
            <TextField name="ui-eircode" label="Eircode" width="short" optional />
            <TextField
              name="ui-rent"
              label="Rent a month"
              prefix="€"
              width="medium"
              inputMode="numeric"
              defaultValue="18500"
              error="Enter the rent a month, like 1,850."
            />
            <SelectField
              name="ui-type"
              label="Type of home"
              width="medium"
              options={[
                { value: 'apartment', label: 'Apartment' },
                { value: 'house', label: 'House' },
              ]}
            />
            <TextArea
              name="ui-note"
              label="Anything else renters should know"
              optional
              hint="Facts about the home only."
            />
            <TextField
              name="ui-reference"
              label="Payment reference"
              width="medium"
              readOnly
              defaultValue="GAFF-12RR"
            />
          </div>
        </Section>

        <Section
          id="choices"
          title="Choice card and choice row"
          lead="One of a few options. The whole card or row is the target. The chosen one takes the brand edge and tint."
        >
          <ChoiceCards
            name="ui-letting-for"
            legend="Who are you letting for?"
            defaultValue="own"
            options={[
              {
                value: 'own',
                label: 'My own home',
                help: 'I’m the landlord.',
                icon: KeyRound,
              },
              {
                value: 'agency',
                label: 'Other people',
                help: 'We’re a letting agency.',
                icon: Building2,
              },
              {
                value: 'renting',
                label: 'I’m looking',
                help: 'I want to rent a home.',
                icon: UserRound,
              },
            ]}
          />
          <div className={styles.fields}>
            <ChoiceGroup
              name="ui-pets"
              legend="Are pets allowed?"
              hint="Assistance dogs are always welcome and never count as pets."
              inline
              defaultValue="no"
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
            />
            <ChoiceGroup
              name="ui-kind"
              legend="What kind of viewing?"
              error="Choose a kind of viewing."
              options={[
                {
                  value: 'slots',
                  label: 'One at a time',
                  hint: 'Each person books their own slot.',
                },
                {
                  value: 'group',
                  label: 'Group viewing',
                  hint: 'Several people at once, up to a limit you set.',
                },
              ]}
            />
            <ChoiceGroup
              name="ui-consent"
              legend="Signing electronically"
              type="checkbox"
              defaultValue="yes"
              options={[{ value: 'yes', label: 'I agree to sign this agreement electronically' }]}
            />
          </div>
        </Section>

        <Section
          id="option-rows"
          title="Option row"
          lead="Something that is off until tapped, and then asks for one value. The whole row is the target."
        >
          <OptionRowDemo />
        </Section>

        <Section
          id="chips"
          title="Chips"
          lead="Filters and quick answers. A row that scrolls sideways with a fade on a phone; a wrapping row on a desktop."
        >
          <Chips
            name="ui-move"
            legend="When do you want to move in?"
            defaultValue="month"
            options={[
              { value: 'now', label: 'As soon as I can' },
              { value: 'month', label: 'Within a month' },
              { value: 'two', label: 'In one to two months' },
              { value: 'later', label: 'Later than that' },
              { value: 'unsure', label: 'I’m not sure yet' },
            ]}
          />
          <Chips
            name="ui-beds"
            legend="Bedrooms"
            type="checkbox"
            defaultValue={['2', '3']}
            options={[
              { value: '1', label: '1 bed' },
              { value: '2', label: '2 beds' },
              { value: '3', label: '3 beds' },
              { value: '4', label: '4 or more' },
            ]}
          />
          <ChipLinks
            label="People"
            items={[
              { href: '#chips', label: 'Everyone · 14', current: true },
              { href: '#chips', label: 'Invited · 8' },
              { href: '#chips', label: 'Booked · 6' },
              { href: '#chips', label: 'Applied · 3' },
            ]}
          />
        </Section>

        <Section
          id="progress"
          title="Segmented progress"
          lead="The steps of a flow, or the four parts of a letting. A phone names the current part; a desktop names them all."
        >
          <Example label="A letting, on its second part">
            <SegmentedProgress label="12 Ranelagh Road" segments={parts} current={1} />
          </Example>
          <Example label="A letting, with the stage inside the part">
            <SegmentedProgress
              label="9 Canal View"
              segments={parts}
              current={1}
              detail="Viewings"
            />
          </Example>
          <Example label="A letting, finished">
            <SegmentedProgress label="4 Rathmines Close" segments={parts} current={4} />
          </Example>
          <Example label="More than six steps: the words say which step">
            <SegmentedProgress label="Add a letting" segments={steps} current={2} />
          </Example>
        </Section>

        <Section
          id="overlays"
          title="Sheet and dialog, menu, toast"
          lead="Each slides up from the bottom on a phone. On a desktop a sheet is a dialog in the middle, a menu opens beside its button, and a toast sits bottom left."
        >
          <Example label="Sheet / dialog">
            <SheetDemo />
          </Example>
          <Example label="Menu">
            <MenuDemo />
          </Example>
          <Example label="Toast, with Undo where the action can be undone">
            <ToastDemo />
          </Example>
        </Section>

        <Section
          id="pickers"
          title="Date and time pickers"
          lead="Dates and times in words, in Irish format. A sheet on a phone; a popover on a desktop."
        >
          <PickerDemos />
        </Section>

        <Section
          id="address-search"
          title="Address search"
          lead="One field for an Eircode or an address. Results appear under it as you type; picking one fills the full address."
        >
          <AddressSearchDemo />
        </Section>

        <Section
          id="photo-uploader"
          title="Photo uploader"
          lead="Drag photos in or choose them. The first is the cover. Reorder by dragging, or from each photo’s menu."
        >
          <PhotoUploaderDemo />
        </Section>

        <Section
          id="code"
          title="Code input"
          lead="Six boxes, the number keyboard, a paste or the phone’s own suggestion."
        >
          <CodeDemo />
        </Section>

        <Section
          id="skeleton"
          title="Skeleton"
          lead="The result’s own layout, with a line saying what’s happening. Nothing shimmers."
        >
          <div className={styles.narrow}>
            <SkeletonGroup label="Reading your advert. This takes a few seconds.">
              <Skeleton shape="photo" />
              <Skeleton shape="title" width="long" />
              <Skeleton width="half" />
              <Skeleton />
              <Skeleton width="long" />
              <Skeleton shape="control" width="half" />
            </SkeletonGroup>
          </div>
        </Section>

        <Section
          id="avatar"
          title="Avatar and badge"
          lead="Initials, never a photo. A badge is words with an icon."
        >
          <div className={styles.row}>
            <Avatar name="Ann Power" size="small" />
            <Avatar name="Ann Power" />
            <Avatar name="Ann Power" size="large" />
            <Avatar name="Halcyon Lettings" tone="strong" />
            <Avatar name="Halcyon Lettings" tone="strong" size="large" />
          </div>
          <div className={styles.person}>
            <Avatar name="Mary Byrne" />
            <div className={styles.personText}>
              <p className={styles.strong}>Mary Byrne</p>
              <Badge>Identity verified</Badge>
            </div>
          </div>
          <div className={styles.person}>
            <Avatar name="Halcyon Lettings" tone="strong" />
            <div className={styles.personText}>
              <p className={styles.strong}>Halcyon Lettings</p>
              <Badge tone="quiet" icon={Building2}>
                Licensed letting agent
              </Badge>
            </div>
          </div>
        </Section>

        <Section
          id="status"
          title="Status pill, notice and outcome"
          lead="A status colour always comes with an icon and words. A renter who misses a check is warning, never danger."
        >
          <div className={styles.row}>
            <StatusPill>Not live yet</StatusPill>
            <StatusPill tone="success">Live</StatusPill>
            <StatusPill tone="info">Viewing booked</StatusPill>
            <StatusPill tone="warning">Reference not back</StatusPill>
            <StatusPill tone="danger">Didn’t send</StatusPill>
            <StatusPill tone="accent">Preferred</StatusPill>
            <DraftedByAi />
          </div>
          <div className={styles.row}>
            <StatusPill tone="success" large>
              Booked
            </StatusPill>
            <StatusPill tone="warning" large>
              On the waiting list
            </StatusPill>
          </div>
          <div className={styles.fields}>
            <Notice tone="info" title="Viewings are on Thursday">
              <p>Six of eight places are booked.</p>
            </Notice>
            <Notice tone="success" title="The agreement is signed">
              <p>Mary signed on Tuesday 10 November.</p>
            </Notice>
            <Notice tone="warning" title="One reference isn’t back yet">
              <p>
                We asked on Monday. <a href="#status">Ask again</a>
              </p>
            </Notice>
            <Notice tone="danger" title="That didn’t send">
              <p>Check your connection and try again.</p>
            </Notice>
            <Outcome tone="success" title="You’re booked for Thursday 12 November, 6pm">
              <p>We’ll email you the day before. You can change or cancel from that email.</p>
            </Outcome>
          </div>
        </Section>

        <Section
          id="lists"
          title="Cards, rows and lists"
          lead="A box only for something that is one object. Space and type first, then a hairline."
        >
          <div className={styles.columns}>
            <div className={styles.listCard}>
              <ActionList>
                <ActionRow
                  id="ui-row-1"
                  href="#lists"
                  icon={Sparkles}
                  tone="ai"
                  title="A reply is ready to send"
                  meta="12 Ranelagh Road · drafted 4 minutes ago"
                  trailing={<DraftedByAi />}
                />
                <ActionRow
                  id="ui-row-2"
                  href="#lists"
                  icon={CalendarClock}
                  tone="warning"
                  title="Choose who views by Friday"
                  meta="4 Rathmines Close · 14 people asked"
                />
                <ActionRow
                  id="ui-row-3"
                  href="#lists"
                  icon={House}
                  title="8 Leeson Park"
                  meta="€2,400 a month · Available from Monday 4 January"
                  trailing={<StatusPill tone="success">Live</StatusPill>}
                />
              </ActionList>
            </div>
            <Card>
              <CardHeader id="ui-terms" title="The offer" />
              <SummaryList
                layout="split"
                rows={[
                  { label: 'Rent', value: '€1,850 a month' },
                  { label: 'Deposit', value: '€1,850' },
                  { label: 'Starts', value: 'Tuesday 15 December' },
                ]}
              />
            </Card>
          </div>
          <StepCard
            id="ui-step"
            number={2}
            title="Pay the deposit and first month’s rent"
            state="current"
            status={<StatusPill tone="info">Waiting for you</StatusPill>}
          >
            <p>Pay €3,700 to Halcyon Lettings’ own account by Friday 11 December.</p>
          </StepCard>
          <Table caption="People who asked to view" head={['Name', 'Asked', 'Meets']}>
            <tr>
              <Cell label="Name">Mary Byrne</Cell>
              <Cell label="Asked">Monday 9 November, 9:12am</Cell>
              <Cell label="Meets">Meets 4 of 4</Cell>
            </tr>
            <tr>
              <Cell label="Name">Tom Walsh</Cell>
              <Cell label="Asked">Monday 9 November, 10:40am</Cell>
              <Cell label="Meets">Meets 3 of 4</Cell>
            </tr>
          </Table>
          <Disclosure summary="How Gaff puts people in order">
            <p>By what they answered against what you asked, then by when they asked.</p>
          </Disclosure>
          <EmptyState
            icon={ClipboardList}
            title="No viewings yet"
            action={
              <ButtonLink href="#lists" variant="primary">
                Add a time
              </ButtonLink>
            }
          >
            <p>Add a time and renters book themselves.</p>
          </EmptyState>
        </Section>

        <Section
          id="calendar"
          title="Calendar"
          lead="Viewing times. Below 900px, a strip of the week’s days and the chosen day as a list; from 900px, the week, 8am to 9pm. Each time is shown with its words, and opens with a tap. Today has a ring; the chosen day takes the brand colour."
        >
          <Calendar
            label="Sample viewing times"
            days={weekOf('2026-11-19').map((date) => ({ date, href: '#calendar' }))}
            today="2026-11-15"
            chosen="2026-11-19"
            title={weekLabel('2026-11-19')}
            previous="#calendar"
            next="#calendar"
            thisWeek="#calendar"
            emptyDay="No viewings this day."
            times={[
              {
                id: 'ui-time-1',
                date: '2026-11-19',
                start: '18:00',
                end: '19:00',
                title: '12 Ranelagh Road',
                meta: '6 of 8 booked',
                href: '#calendar',
              },
              {
                id: 'ui-time-2',
                date: '2026-11-19',
                start: '18:30',
                end: '19:15',
                title: '4 Harbour View',
                meta: '8 of 8 booked · 3 waiting',
                href: '#calendar',
              },
              {
                id: 'ui-time-3',
                date: '2026-11-16',
                start: '12:00',
                end: '12:45',
                title: '9 Canal View',
                meta: '3 of 3 booked',
                flag: 'Mark who came',
                href: '#calendar',
              },
              {
                id: 'ui-time-4',
                date: '2026-11-21',
                start: '11:00',
                end: '12:00',
                title: '12 Ranelagh Road',
                meta: '2 of 10 booked',
                href: '#calendar',
              },
            ]}
          />
        </Section>

        <Section
          id="pick-list"
          title="Pick list"
          lead="Ticking people from a ranked list, as in Choose who views. The whole row is the tick; Why here shows the reason for the row's place. People who haven't answered come last, under a divider."
        >
          <PickList
            name="dev-invite"
            legend="Who to invite"
            summary="2 places · {n} chosen"
            groups={[
              {
                items: [
                  {
                    value: 'a',
                    label: 'Aoife Byrne',
                    meta: 'Meets 4 of 4',
                    detail: 'Meets all 4 criteria. Enquired Monday 3 November, 9:20am.',
                    defaultChecked: true,
                  },
                  {
                    value: 'c',
                    label: 'Ciarán Ó Súilleabháin',
                    meta: 'Meets 3 of 4',
                    detail: 'Meets 3 of 4 criteria (has pets). Enquired Monday 3 November, 10am.',
                    defaultChecked: true,
                  },
                ],
              },
              {
                heading: 'Haven’t answered the questions yet',
                items: [
                  {
                    value: 'n',
                    label: 'Niamh Walsh',
                    meta: 'Hasn’t answered the questions yet',
                    detail: 'Hasn’t answered the questions yet. Enquired Tuesday 4 November, 8am.',
                  },
                ],
              },
            ]}
          />
        </Section>

        <Section
          id="person-cards"
          title="Person card"
          lead="Applicants to choose between: stacked on a phone, three across on a desktop, then scrolling. Each card is a radio; the chosen card takes the brand edge and a tick."
        >
          <PersonCards name="dev-preferred" legend="Who to offer the home to">
            <PersonCard
              name="dev-preferred"
              value="a"
              person="Aoife Byrne"
              defaultChecked
              status={<StatusPill tone="success">Your choice now</StatusPill>}
              facts={[
                { label: 'Criteria', value: 'Meets 4 of 4' },
                {
                  label: 'Take-home income',
                  value: (
                    <>
                      €5,200 a month, 2.8 times the rent{' '}
                      <StatusPill tone="success">Meets your income rule</StatusPill>
                    </>
                  ),
                },
                { label: 'How they earn', value: 'From a job' },
              ]}
            />
            <PersonCard
              name="dev-preferred"
              value="c"
              person="Ciarán Ó Súilleabháin"
              facts={[
                { label: 'Criteria', value: 'Meets 3 of 4' },
                {
                  label: 'Take-home income',
                  value: (
                    <>
                      €4,000 a month, 2.1 times the rent. Your rule is 2.5 times the rent.{' '}
                      <StatusPill tone="warning">Below your income rule</StatusPill>
                    </>
                  ),
                },
                { label: 'How they earn', value: 'Self-employed' },
              ]}
            />
            <PersonCard
              name="dev-preferred"
              value="n"
              person="Niamh Walsh"
              facts={[
                { label: 'Criteria', value: 'Meets 4 of 4' },
                { label: 'Take-home income', value: '€6,000 a month, 3.2 times the rent' },
                { label: 'How they earn', value: 'Something else' },
              ]}
            />
          </PersonCards>
        </Section>

        <Section
          id="message-preview"
          title="Message preview"
          lead="A fixed message as the person will get it: to read, never to edit."
        >
          <MessagePreview
            label="The invitation"
            subject="Book a viewing: 12 Ranelagh Road"
            body={
              'Hi Aoife,\n\nThanks for your interest in 12 Ranelagh Road. Halcyon Lettings would like to invite you to view it.\n\nHalcyon Lettings'
            }
          />
        </Section>

        <Section
          id="search-box"
          title="Search box with chips"
          lead="One box for a sentence, its button, and what Gaff understood as chips: Filters first, then one chip per filter, each opening its control. The heart saves a home."
        >
          <SearchBoxDemo />
          <HomeGrid label="Search results">
            <HomeCard
              href="#homes"
              title="€1,850 a month"
              line="2-bed apartment · Ranelagh, Dublin 6"
              details={['Free from Tuesday 1 December', 'Up to 2 people. You asked for 3.']}
              photo={{ src: samplePhoto, alt: '' }}
            />
          </HomeGrid>
        </Section>

        <Section
          id="homes"
          title="Home card"
          lead="A home in a list, led by its photo at 3:2: one column on a phone, three across on a desktop. Without a photo, a house icon. The whole card is one link."
        >
          <HomeGrid label="Homes">
            <HomeCard
              href="#homes"
              title="12 Ranelagh Road"
              line="Viewings · 8 of 14 booked"
              photo={{ src: samplePhoto, alt: '' }}
              needsYou="Needs you"
            />
            <HomeCard href="#homes" title="4 Rathmines Close" line="Enquiries · 23 so far" />
            <HomeCard href="#homes" title="9 Canal View" line="2 steps left" needsYou="Needs you" />
            <HomeCard
              href="#homes"
              title="Apartment 14, The Old Distillery, Smithfield"
              line="Let in 21 days · saved 9 days and 4 hours 20 minutes"
            />
          </HomeGrid>
        </Section>

        <Section
          id="home-page"
          title="A home’s page: gallery, action card, show more"
          lead="The gallery swipes on a phone, with Previous and Next, and is a grid of five on a desktop; any photo opens full screen. The action card is fixed to the foot of a phone’s screen and held to the right on a desktop (shown here in place). Long text shows three lines, then Show more."
        >
          <Example label="Gallery: six photos">
            <Gallery
              label="12 Ranelagh Road"
              photos={[1, 2, 3, 4, 5, 6].map((n) => ({ src: `${samplePhoto}#${n}` }))}
            />
          </Example>
          <div className={styles.columns}>
            <Example label="Action card, with Call">
              <ActionCard
                inPlace
                price="€1,850 a month"
                action={{ href: '#home-page', label: 'Ask to view' }}
                call={{ label: 'Call', name: 'Call 01 234 5678', href: 'tel:012345678' }}
                line="Free. You’ll hear back either way."
              />
            </Example>
            <Example label="Show more">
              <ShowMore
                paragraphs={[
                  'A bright apartment on the first floor of a quiet red-brick terrace, five minutes’ walk from the Luas.',
                  'The kitchen was refitted last year, with a gas hob, a dishwasher and a washer-dryer. Both bedrooms are doubles with fitted wardrobes.',
                  'There is a small garden to the back, shared with one other apartment.',
                ]}
              />
            </Example>
          </div>
        </Section>

        <Section
          id="renter"
          title="For a renter’s pages"
          lead="A few questions one per screen; a viewing chosen by day, then time; steps as a short list; a document with links to its sections."
        >
          <div className={styles.columns}>
            <Example label="Question steps: one question per screen, Back and one primary button">
              <QuestionStepsDemo />
            </Example>
            <Example label="Time picker for renters: days, then the chosen day’s times">
              <TimePicker
                daysLabel="Days with a place"
                days={[
                  { href: '#renter', label: 'Fri 20 Nov', current: true },
                  { href: '#renter', label: 'Sat 21 Nov' },
                  { href: '#renter', label: 'Mon 23 Nov' },
                ]}
                dayHeading="Friday 20 November"
                times={[
                  { href: '#renter', label: '6pm' },
                  { href: '#renter', label: '6:15pm' },
                  { href: '#renter', label: '6:30pm', note: 'Group viewing, 3 places left' },
                ]}
              />
            </Example>
          </div>
          <div className={styles.columns}>
            <Example label="Step list: done, next and to come, in words">
              <StepList
                label="Your checks"
                steps={[
                  { name: 'Your ID', state: 'done', stateLabel: 'Done' },
                  { name: 'Your income', state: 'next', stateLabel: 'Next' },
                  {
                    name: 'Your references',
                    state: 'to_come',
                    stateLabel: 'To come',
                    note: 'Your last landlord, and an employer if there’s one to ask',
                  },
                ]}
              />
            </Example>
            <Example label="Numbered steps: what to do elsewhere, in order">
              <NumberedSteps
                label="Steps in Gmail"
                steps={[
                  'Open Gmail’s settings at Forwarding and POP/IMAP.',
                  'Paste your Gaff address, then choose Next and Proceed.',
                  'Gmail sends Gaff a confirmation code, and Gaff shows it to you.',
                ]}
              />
            </Example>
            <Example label="Directions: the phone’s own maps app, or OpenStreetMap">
              <div className={styles.row}>
                <DirectionsLink address="12 Ranelagh Road, Ranelagh, Dublin 6">
                  Get directions
                </DirectionsLink>
              </div>
            </Example>
          </div>
          <div className={styles.columns}>
            <Example label="Setup checklist: a ring, the next step and its one button">
              <SetupChecklist
                title="Get set up"
                done={1}
                total={3}
                steps={[
                  { name: 'Add your first letting', done: true },
                  { name: 'Send your Daft enquiries to Gaff', done: false },
                  { name: 'Invite your team', done: false },
                ]}
                next={{
                  name: 'Send your Daft enquiries to Gaff',
                  why: 'One rule in your email, about two minutes. Then Gaff answers those too.',
                  action: (
                    <ButtonLink href="#lists" variant="secondary" fullWidth="phone">
                      Set up forwarding
                    </ButtonLink>
                  ),
                }}
              />
            </Example>
            <Example label="Prompt: one line, one action, and Not now">
              <Prompt
                id="demo-prompt"
                icon={Users}
                title="Invite your team"
                action={
                  <ButtonLink href="#lists" variant="secondary">
                    Invite your team
                  </ButtonLink>
                }
                decline={<Button variant="quiet">Not now</Button>}
              >
                <p>Colleagues see every letting and can cover for each other.</p>
              </Prompt>
            </Example>
          </div>
          <Example label="A document with links that jump to each section">
            <DocumentView
              title="Tenancy agreement: 12 Ranelagh Road"
              contents="In this agreement"
              sections={[
                { heading: '1. The home', paragraphs: ['12 Ranelagh Road, Ranelagh, Dublin 6.'] },
                {
                  heading: '2. The rent',
                  paragraphs: ['€1,850 a month, paid in advance on the 13th day of each month.'],
                },
              ]}
            />
          </Example>
        </Section>

        <Section
          id="thread"
          title="Thread and reply box"
          lead="A conversation, like any messaging app. Below 900px the list is a screen and the open conversation is a screen, with a way back; above, they sit side by side. A draft waits in the reply box, already written, with what Gaff couldn’t answer marked in it."
        >
          <Example label="The list of conversations, with none open">
            <ThreadLayout open={false} list={<SampleConversations label="Conversations" />}>
              <EmptyState icon={MessagesSquare} title="Choose a conversation">
                <p>It opens here, with anything Gaff has drafted ready to send.</p>
              </EmptyState>
            </ThreadLayout>
          </Example>
          <Example label="A conversation, open, with a draft in the reply box">
            <ThreadLayout
              open
              list={<SampleConversations label="Conversations, with one open" current />}
            >
              <OpenConversation labelledBy="ui-thread-title">
                <ThreadHeader
                  id="ui-thread-title"
                  back={{ href: '#thread', label: 'Inbox' }}
                  title="Aoife Byrne"
                  meta="12 Ranelagh Road"
                />
                <Thread label="Messages with Aoife">
                  <ThreadMessage from="them" name="Aoife" when="Yesterday, 6:10pm">
                    Hi, is it furnished? Is there a garden?
                  </ThreadMessage>
                  <ThreadMessage from="gaff" name="Gaff" when="Yesterday, 6:10pm">
                    {'Hello Aoife,\n\nThanks for your enquiry about 12 Ranelagh Road.'}
                  </ThreadMessage>
                  <ThreadMessage from="you" name="You" when="9:02am">
                    The side gate is open on the day.
                  </ThreadMessage>
                  <ThreadMessage from="colleague" name="Niamh" when="9:14am" state="sending">
                    I’ll be there from half five.
                  </ThreadMessage>
                  <ThreadMessage from="gaff" name="Gaff" when="9:20am" state="not_sent" byText>
                    Your viewing is tomorrow at 6pm.
                  </ThreadMessage>
                </Thread>
                <ReplyBox id="ui-reply-title" title="Reply to Aoife" pill={<DraftedByAi />}>
                  <form className={formClass}>
                    <DraftText>
                      {'Hello Aoife,\n\nYou asked: Is it furnished?\nYes, it’s furnished.'}
                    </DraftText>
                    <DraftGap>
                      <TextArea
                        name="ui-gap"
                        label="Gaff doesn’t know: Is there a garden?"
                        hint="Leave it empty and Gaff tells Aoife a person will reply about it."
                        rows={3}
                      />
                      <ChoiceGroup
                        type="checkbox"
                        name="ui-remember"
                        legend="Remember your answer"
                        hideLegend
                        defaultValue="yes"
                        options={[
                          {
                            value: 'yes',
                            label: 'Remember this for 12 Ranelagh Road',
                            hint: 'Gaff uses your answer for everyone who asks about this home.',
                          },
                        ]}
                      />
                    </DraftGap>
                    <DraftText>
                      {
                        'If you have any other questions, just reply to this email.\n\nHalcyon Lettings’ AI assistant'
                      }
                    </DraftText>
                    <FormActions>
                      <Button variant="primary">Send</Button>
                      <Button>Edit</Button>
                      <Button variant="quiet">Don’t send</Button>
                    </FormActions>
                  </form>
                </ReplyBox>
              </OpenConversation>
            </ThreadLayout>
          </Example>
        </Section>
      </main>
    </div>
  );
}
