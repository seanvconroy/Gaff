'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/server/auth/staff';
import { addTester, addTesterInput, removeTester } from '@/server/staff/testers';

/** The test copy: an admin makes someone a tester (Gaff staff). */
export async function addTesterAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const parsed = addTesterInput.safeParse({
    email: String(formData.get('email') ?? ''),
    role: String(formData.get('role') ?? 'admin'),
  });
  if (!parsed.success) redirect('/staff/testers?result=invalid');
  const result = await addTester(staff, parsed.data);
  revalidatePath('/staff/testers');
  redirect(`/staff/testers?result=${result}`);
}

export async function removeTesterAction(userId: string): Promise<void> {
  const staff = await requireStaff();
  const result = await removeTester(staff, userId);
  revalidatePath('/staff/testers');
  redirect(`/staff/testers?result=${result}`);
}
