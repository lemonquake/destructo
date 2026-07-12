export const CAPTURE_SECONDS = 5;

export class DominationSystem {
  constructor(towers, teams, maxScore = 100) {
    this.towers = towers;
    this.teams = teams;
    this.maxScore = Math.max(25, Number(maxScore) || 100);
    this.scores = Object.fromEntries(teams.map(team => [team.id, 0]));
    this.winner = null;
  }

  update(dt, combatants) {
    if (this.winner) return [];
    const events = [];
    for (const tower of this.towers) {
      const occupants = new Map();
      for (const unit of combatants) {
        if (unit.dead || unit.type !== 'unit' || !unit.team) continue;
        const dx = unit.group.position.x - tower.position.x;
        const dz = unit.group.position.z - tower.position.z;
        if (dx * dx + dz * dz <= tower.radius * tower.radius) occupants.set(unit.team, (occupants.get(unit.team) || 0) + 1);
      }
      const present = [...occupants.keys()];
      tower.contested = present.length > 1;
      if (present.length === 1) {
        const teamId = present[0];
        if (tower.ownerTeam === teamId) {
          tower.captureTeam = null;
          tower.captureProgress = 0;
        } else {
          if (tower.captureTeam !== teamId) { tower.captureTeam = teamId; tower.captureProgress = 0; events.push({ type: 'capture-start', tower, teamId }); }
          tower.captureProgress = Math.min(CAPTURE_SECONDS, tower.captureProgress + dt);
          if (tower.captureProgress >= CAPTURE_SECONDS) {
            const previousTeam = tower.ownerTeam;
            tower.ownerTeam = teamId;
            tower.captureTeam = null;
            tower.captureProgress = 0;
            tower.contested = false;
            events.push({ type: 'captured', tower, teamId, previousTeam });
          }
        }
      } else if (present.length === 0) {
        tower.captureProgress = Math.max(0, tower.captureProgress - dt * .65);
        if (tower.captureProgress === 0) tower.captureTeam = null;
      }
    }

    for (const tower of this.towers) if (tower.ownerTeam) this.scores[tower.ownerTeam] = Math.min(this.maxScore, this.scores[tower.ownerTeam] + dt);
    const winner = this.teams.find(team => this.scores[team.id] >= this.maxScore);
    if (winner) { this.winner = winner; events.push({ type: 'victory', teamId: winner.id }); }
    return events;
  }
}
