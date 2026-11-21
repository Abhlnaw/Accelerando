"""Read simultaneous score material as fixed lines, before hearing the performance."""
from collections import defaultdict
from dataclasses import dataclass
from fractions import Fraction

from contracts import ScoreNote
from .importer import (_duration, _integer, _midi, _number, _ties, _read_root, _read_attacks, _part,
                       _validate_navigation, ScoreInputError)


@dataclass
class ScoreLine:
    label: str
    notes: list[ScoreNote]


def read_lines(path):
    root = _read_root(path)
    # Rolled-chord and string articulation marks do not change the written
    # attack pitches. Keep the notes available for line recognition.
    for parent in root.iter():
        for mark in list(parent):
            if mark.tag in {"arpeggiate", "non-arpeggiate", "hammer-on", "pull-off", "slide"}:
                parent.remove(mark)
    _validate_navigation(root)
    names = {p.get("id"): p.findtext("part-name") for p in root.findall("part-list/score-part")}
    lines = []
    # Preserve the strict tie and notation checks for an ordinary single line.
    parts = root.findall("part")
    if (len(parts) == 1 and all(root.find(".//" + tag) is None for tag in
                                ("backup", "chord", "transpose", "unpitched"))
            and all(len({e.text for e in root.iter(tag)}) <= 1 for tag in ("voice", "staff"))):
        part = _part(root)
        notes = [ScoreNote(n.id, n.measure_label, float(n.onset), float(n.duration), n.midi)
                 for n in _read_attacks(part)]
        if len(notes) > 1000:
            raise ScoreInputError("Choose a shorter score excerpt for line matching.")
        return [ScoreLine(names.get(part.get("id")) or part.get("id") or "Part 1", notes)]
    for index, part in enumerate(root.findall("part"), 1):
        name = names.get(part.get("id")) or part.get("id") or f"Part {index}"
        lines.extend(_part_lines(part, name))
    if not lines:
        raise ScoreInputError("This score has no pitched notes to assess.")
    if len(lines) > 80 or sum(len(line.notes) for line in lines) > 8000:
        raise ScoreInputError("Choose a shorter score excerpt for line matching.")
    # Doubled unison lines have identical assessment targets. Either label is valid.
    unique = {}
    for line in lines:
        key = tuple((n.measure_label, n.onset_qn, n.duration_qn, n.midi) for n in line.notes)
        if key in unique:
            unique[key].label += " / " + line.label
        else:
            unique[key] = line
    return list(unique.values())


def _part_lines(part, name):
    voices = defaultdict(lambda: defaultdict(list))
    start = Fraction(0)
    divisions = None
    shift = 0
    for bar_index, bar in enumerate(part.findall("measure"), 1):
        cursor = boundary = start
        previous = None
        pass_number = 1
        label = bar.get("number") or str(bar_index)
        if bar.get("implicit") != "yes":
            label = bar.get("text") or label
        for node in bar:
            if node.tag == "attributes":
                if node.find("divisions") is not None:
                    divisions = _number(node.findtext("divisions"), "divisions")
                    if divisions <= 0:
                        raise ScoreInputError("Set positive MusicXML divisions.")
                tr = node.find("transpose")
                if tr is not None:
                    if tr.find("double") is not None or tr.get("number"):
                        raise ScoreInputError("Export staff-specific or doubled transposition at concert pitch.")
                    shift = _integer(tr.findtext("chromatic", "0"), "chromatic") + 12 * _integer(
                        tr.findtext("octave-change", "0"), "octave change")
                continue
            if node.tag not in {"note", "forward", "backup"}:
                continue
            duration = _duration(node, divisions)
            if node.tag == "backup":
                cursor -= duration
                previous = None
                pass_number += 1
                if cursor < start:
                    raise ScoreInputError("A MusicXML backup crosses the measure start.")
                continue
            chord = node.find("chord") is not None
            if chord and previous is None:
                raise ScoreInputError("A chord tone needs a preceding attack.")
            onset = previous if chord else cursor
            if not chord:
                previous = onset if node.tag == "note" else None
                cursor += duration
            boundary = max(boundary, onset + duration)
            if node.tag == "note" and node.find("pitch") is not None:
                lane = (node.findtext("staff", "1"), node.findtext("voice", str(pass_number)))
                voices[lane][onset].append((_midi(node) + shift, duration, bar_index, label, _ties(node)))
        start = boundary

    result = []
    for (staff, voice), attacks in voices.items():
        groups = [(t, sorted(chord, key=lambda n: -n[0])) for t, chord in sorted(attacks.items())]
        depth = max(len(chord) for _, chord in groups)
        if depth > 16 or len(groups) > 1000 or len(result) + depth > 80:
            raise ScoreInputError("Choose a shorter score excerpt for line matching.")
        for rank in range(depth):
            notes = []
            ordinal = defaultdict(int)
            for t, chord in groups:
                pitch, duration, bar, label, ties = chord[min(rank, len(chord)-1)]
                if ("stop" in ties and notes and notes[-1].midi == pitch and
                        abs(notes[-1].onset_qn + notes[-1].duration_qn - float(t)) < 1e-7):
                    notes[-1].duration_qn += float(duration)
                    continue
                ordinal[bar] += 1
                notes.append(ScoreNote(f"m{bar}n{ordinal[bar]}", label, float(t), float(duration), pitch))
            label = f"{name} · staff {staff} · voice {voice}"
            if depth > 1:
                label += f" · chord tone {rank+1} from top"
            result.append(ScoreLine(label, notes))
    return result


def select_line(lines, events):
    """Rank complete written lines by ordered, near-unison anchors (Dice similarity)."""
    if len(lines) == 1:
        return lines[0], False
    heard = [e.midi_float for e in events if e.confidence >= .65]
    ranked = []
    for line in lines:
        previous = [0] * (len(heard) + 1)
        for note in line.notes:
            row = [0]
            for j, pitch in enumerate(heard):
                row.append(max(previous[j] + (abs(note.midi-pitch) <= .65), row[-1], previous[j+1]))
            previous = row
        ranked.append((2 * previous[-1] / (len(line.notes) + len(heard)), line))
    ranked.sort(key=lambda item: -item[0])
    return ranked[0][1], ranked[0][0] - ranked[1][0] < .05
