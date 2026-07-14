export const CAPTURE_SECONDS = 5;

export class DominationSystem {
  constructor(towers, teams, maxScore = 100, isHostile = null) {
    this.towers = towers;
    this.teams = teams;
    this.maxScore = Math.max(25, Number(maxScore) || 100);
    this.scores = Object.fromEntries(teams.map(team => [team.id, 0]));
    this.winner = null;
    this.isHostile = isHostile || ((a, b) => a !== b);
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
      const present = [...occupants.keys()],sides=[];
      for(const teamId of present){const alliedSide=sides.find(side=>!this.isHostile(side[0],teamId));if(alliedSide)alliedSide.push(teamId);else sides.push([teamId]);}
      tower.captureSides=sides.map(side=>[...side]);
      tower.contested = sides.length > 1;
      if (sides.length === 1) {
        const side=sides[0],sideLeader=side[0],ownerAllied=tower.ownerTeam&&!this.isHostile(tower.ownerTeam,sideLeader);
        if (ownerAllied) {
          tower.captureTeam = null;
          tower.captureProgress = 0;
        } else {
          const captureStillAllied=tower.captureTeam&&!this.isHostile(tower.captureTeam,sideLeader);
          const teamId=captureStillAllied?tower.captureTeam:sideLeader;
          if (!captureStillAllied) { tower.captureTeam = teamId; tower.captureProgress = 0; events.push({ type: 'capture-start', tower, teamId }); }
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
      } else if (sides.length === 0) {
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
