(function (root) {
  function formatDuration(totalSeconds) {
    const whole = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const minutes = Math.floor(whole / 60);
    const seconds = whole % 60;
    if (!minutes) return `${seconds} segundo${seconds === 1 ? '' : 's'}`;
    if (!seconds) return `${minutes} minuto${minutes === 1 ? '' : 's'}`;
    return `${minutes} minuto${minutes === 1 ? '' : 's'} e ${seconds} segundo${seconds === 1 ? '' : 's'}`;
  }
  function formatClockTime(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  function formatPcrStartTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `Às ${formatClockTime(date)}h`;
  }
  function conjunction(items) {
    if (items.length < 2) return items[0] || '';
    return `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;
  }
  function countWord(count, feminine = false) {
    const words = ['', feminine ? 'uma' : 'um', feminine ? 'duas' : 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];
    return words[count] || String(count);
  }
  function lowerInitial(name) {
    const trimmed = String(name).trim();
    return trimmed === trimmed.toLocaleUpperCase('pt-BR') ? trimmed : trimmed[0].toLocaleLowerCase('pt-BR') + trimmed.slice(1);
  }
  function buildClinicalEvolution(data) {
    const events = [...(data.events || [])].reverse().sort((a, b) => a.seconds - b.seconds);
    const cycles = Math.max(0, Math.floor(data.cycles || 0));
    const duration = Math.max(0, Math.floor(data.totalSeconds || 0));
    const cycleMinutes = Number(data.cycleSeconds || 120) / 60;
    const cycleLength = Number.isInteger(cycleMinutes) ? String(cycleMinutes) : String(cycleMinutes).replace('.', ',');
    let narrative;
    if (cycles > 0) {
      const cycleDescription = cycles === 1
        ? `Foi iniciado um ciclo, com duração de ${cycleLength} ${cycleMinutes === 1 ? 'minuto' : 'minutos'} quando completo.`
        : `Foram iniciados ${countWord(cycles)} ciclos, com duração de ${cycleLength} ${cycleMinutes === 1 ? 'minuto' : 'minutos'} por ciclo completo.`;
      narrative = `Paciente em parada cardiorrespiratória (PCR) recebeu manobras de reanimação cardiopulmonar (RCP). ${cycleDescription}`;
      if (duration > 0) narrative += ` O tempo total de PCR registrado foi de ${formatDuration(duration)}.`;
    } else if (duration > 0) {
      narrative = `Paciente em parada cardiorrespiratória (PCR), com tempo total registrado de ${formatDuration(duration)}.`;
    } else {
      narrative = 'Sessão de parada cardiorrespiratória (PCR) iniciada, sem ciclos de RCP registrados até o momento.';
    }

    const grouped = new Map();
    for (const event of events) {
      const name = String(event?.name || '').trim().replace(/[.,;:!?]+$/, '').trim();
      const normalizedName = name.toLocaleLowerCase('pt-BR');
      if (!name || normalizedName === 'óbito' || normalizedName === 'novo ciclo iniciado') continue;
      const key = `${event.kind || 'action'}:${normalizedName}`;
      if (!grouped.has(key)) grouped.set(key, { name, kind: event.kind || 'action', count: 0 });
      grouped.get(key).count += 1;
    }
    const interventions = [...grouped.values()];
    const descriptions = interventions.map(({ name, kind, count }, index) => {
      const lowerName = lowerInitial(name);
      if (kind === 'medication') {
        const repeatedNoun = interventions[index - 1]?.kind === 'medication';
        return `${countWord(count, true)}${repeatedNoun ? '' : ` ${count === 1 ? 'administração' : 'administrações'}`} de ${lowerName}`;
      }
      if (lowerName === 'desfibrilação') return `${countWord(count, true)} ${count === 1 ? 'desfibrilação' : 'desfibrilações'}`;
      return `${countWord(count, true)} ${count === 1 ? 'intervenção' : 'intervenções'} de ${lowerName}`;
    });
    if (descriptions.length) {
      const totalInterventions = interventions.reduce((total, item) => total + item.count, 0);
      narrative += ` Ao longo da assistência, ${totalInterventions === 1 ? 'foi registrada' : 'foram registradas'} ${conjunction(descriptions)}.`;
      const adrenaline = interventions.find(item => item.name.toLocaleLowerCase('pt-BR') === 'adrenalina');
      const adrenalineInterval = Math.max(0, Math.floor(Number(data.adrenalineIntervalSeconds ?? 180)));
      if (adrenaline?.count > 1 && adrenalineInterval > 0) {
        narrative += ` As administrações de adrenalina seguiram intervalo de ${formatDuration(adrenalineInterval)} entre as doses.`;
      }
    }

    if (data.outcome === 'rce') {
      narrative += ' Posteriormente, foi registrado retorno da circulação espontânea (RCE).';
    } else if (data.outcome === 'death') {
      const physician = String(data.physicianName || '').trim().replace(/[.,;]+$/, '');
      const physicianName = physician.replace(/^(?:dr\.?|dra\.?|doutor|doutora|médico|médica)\s+/i, '').trim();
      const responsible = physicianName ? ` pelo médico responsável, DR. ${physicianName},` : ' pelo médico responsável';
      const deathTime = String(data.deathTime || '').replace(/^(\d{2}):(\d{2})$/, '$1h$2');
      narrative += data.noRceConfirmed
        ? ` Sem retorno da circulação espontânea, o óbito foi constatado e declarado${responsible} às ${deathTime}.`
        : ` O óbito foi constatado e declarado${responsible} às ${deathTime}.`;
      if (data.socialWorkerContact) narrative += ' Após a declaração médica, a assistente social foi acionada para contato com familiar.';
      const care = [];
      if (data.postMortem?.devicesRemoved) care.push('a retirada de todos os dispositivos do paciente');
      if (data.postMortem?.bag) care.push('o preparo e acondicionamento do corpo em saco próprio para óbito');
      if (data.postMortem?.identification) care.push('a identificação do corpo conforme protocolo institucional');
      if (care.length) narrative += ` ${data.socialWorkerContact ? 'Nos cuidados pós-morte' : 'Após a declaração médica'}, a equipe de enfermagem realizou ${conjunction(care)}.`;
      if (data.postMortem?.morgue) narrative += care.length
        ? ' Posteriormente, o corpo foi encaminhado ao necrotério da unidade.'
        : ' O corpo foi encaminhado ao necrotério da unidade.';
    } else if (data.outcome === 'stopped') {
      narrative += ' A reanimação foi encerrada, sem desfecho informado.';
    } else if (data.outcome === 'other' && String(data.otherOutcome || '').trim()) {
      const otherOutcome = String(data.otherOutcome).trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, marks => marks.at(-1));
      narrative += ` Desfecho registrado: ${otherOutcome}${/[.!?]$/.test(otherOutcome) ? '' : '.'}`;
    }
    const startTime = formatPcrStartTime(data.pcrStartTime);
    return startTime ? `${startTime}, ${narrative[0].toLocaleLowerCase('pt-BR')}${narrative.slice(1)}` : narrative;
  }
  function evolutionHtml(text) {
    const escapeHtml = (value) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
    return text.split(/\n\s*\n/).map(paragraph => `<p style="text-align:justify;margin:0 0 1em">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('');
  }
  async function copyEvolutionText(text, clipboard) {
    if (clipboard?.write && typeof root.ClipboardItem === 'function' && typeof root.Blob === 'function') {
      try {
        await clipboard.write([new root.ClipboardItem({
          'text/plain': new root.Blob([text], { type: 'text/plain' }),
          'text/html': new root.Blob([evolutionHtml(text)], { type: 'text/html' })
        })]);
        return 'formatted';
      } catch { /* Some browsers accept only plain text. */ }
    }
    await clipboard.writeText(text);
    return 'plain';
  }
  async function shareEvolutionText(text, sharing) {
    if (sharing.share) {
      await sharing.share({ title: 'Evolução de enfermagem — ED-PCR', text });
      return 'shared';
    }
    await copyEvolutionText(text, sharing.clipboard);
    return 'copied';
  }
  root.buildClinicalEvolution = buildClinicalEvolution;
  root.formatClockTime = formatClockTime;
  root.formatPcrStartTime = formatPcrStartTime;
  root.copyEvolutionText = copyEvolutionText;
  root.shareEvolutionText = shareEvolutionText;
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildClinicalEvolution, formatDuration, formatClockTime, formatPcrStartTime, copyEvolutionText, shareEvolutionText };
})(globalThis);
