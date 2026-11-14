import { describe, expect, it } from 'vitest';
import { removalProblem, roleChangeProblem, teamChangeWords, type TeamSeat } from './team-rules';

const ann: TeamSeat = { userId: 'ann', role: 'admin' };
const brid: TeamSeat = { userId: 'brid', role: 'admin' };
const cian: TeamSeat = { userId: 'cian', role: 'negotiator' };

describe('AU10, M16: changing who’s on a team', () => {
  it('lets an admin remove a colleague', () => {
    expect(removalProblem([ann, cian], ann, 'cian')).toBeNull();
    expect(removalProblem([ann, brid], ann, 'brid')).toBeNull();
  });

  it('lets an admin change a colleague’s role, either way', () => {
    expect(roleChangeProblem([ann, cian], ann, 'cian', 'admin')).toBeNull();
    expect(roleChangeProblem([ann, brid], ann, 'brid', 'negotiator')).toBeNull();
  });

  it('is for admins only', () => {
    expect(removalProblem([ann, cian], cian, 'ann')).toBe('not_admin');
    expect(roleChangeProblem([ann, cian], cian, 'cian', 'admin')).toBe('not_admin');
  });

  it('only reaches people on this team', () => {
    expect(removalProblem([ann, cian], ann, 'someone-else')).toBe('not_on_team');
    expect(roleChangeProblem([ann, cian], ann, 'someone-else', 'admin')).toBe('not_on_team');
  });

  it('always keeps at least one admin', () => {
    expect(removalProblem([ann, cian], ann, 'ann')).toBe('last_admin');
    expect(roleChangeProblem([ann, cian], ann, 'ann', 'negotiator')).toBe('last_admin');
  });

  it('leaves an admin’s own place to another admin', () => {
    expect(removalProblem([ann, brid], ann, 'ann')).toBe('yourself');
    expect(roleChangeProblem([ann, brid], ann, 'ann', 'negotiator')).toBe('yourself');
  });

  it('has plain words for each problem, with no blame', () => {
    for (const words of Object.values(teamChangeWords)) {
      expect(words.length).toBeGreaterThan(10);
      expect(words).not.toContain('!');
    }
  });
});
