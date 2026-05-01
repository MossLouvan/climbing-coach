import { evaluateCaption } from '@analysis/wallDetector/keywords';

describe('evaluateCaption', () => {
  it('accepts canonical climbing-wall captions', () => {
    const v = evaluateCaption('a person climbing a climbing wall in a gym');
    expect(v.isClimbingWall).toBe(true);
    expect(v.matchedPositive.length).toBeGreaterThan(0);
    expect(v.matchedNegative.length).toBe(0);
  });

  it('accepts bouldering captions', () => {
    expect(evaluateCaption('bouldering indoors').isClimbingWall).toBe(true);
    expect(evaluateCaption('a boulder problem on overhang').isClimbingWall).toBe(true);
  });

  it('accepts outdoor rock climbing', () => {
    expect(evaluateCaption('rock climbing on a cliff').isClimbingWall).toBe(true);
    expect(evaluateCaption('a climber on a rock face').isClimbingWall).toBe(true);
  });

  it('rejects kitchens and living rooms', () => {
    expect(evaluateCaption('a kitchen with a fridge').isClimbingWall).toBe(false);
    expect(evaluateCaption('a couch in a living room').isClimbingWall).toBe(false);
  });

  it('rejects a climber plant on a wall', () => {
    const v = evaluateCaption('a climber plant on a wall');
    expect(v.isClimbingWall).toBe(false);
    expect(v.matchedNegative).toContain('climber plant');
  });

  it('rejects empty captions', () => {
    expect(evaluateCaption('').isClimbingWall).toBe(false);
  });

  it('is case insensitive', () => {
    expect(evaluateCaption('ROCK CLIMBING on a cliff').isClimbingWall).toBe(true);
  });
});
