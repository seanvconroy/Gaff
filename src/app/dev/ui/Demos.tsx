'use client';

import { Copy, Pencil, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/ui/Button';
import { Chips } from '@/ui/Chips';
import { CodeInput } from '@/ui/CodeInput';
import { TextField } from '@/ui/Field';
import { Menu, MenuItem } from '@/ui/Menu';
import { DateField, TimeField } from '@/ui/Pickers';
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
