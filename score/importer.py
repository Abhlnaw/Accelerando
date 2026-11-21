"""Normalize a single concert-pitch MusicXML melody into shared score notes."""

from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from xml.etree import ElementTree as ET

from contracts import InputError, ScoreNote


class ScoreInputError(InputError):
    """The score could not be read as a supported melody."""


@dataclass
class _Attack:
    id: str
    measure_label: str
    onset: Fraction
    duration: Fraction
    midi: int


_PITCH_CLASSES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_NAVIGATION_ATTRIBUTES = {"dacapo", "dalsegno", "tocoda"}
_UNSUPPORTED_MARKINGS = {
    "ornaments", "arpeggiate", "non-arpeggiate", "glissando", "slide",
    "bend", "hammer-on", "pull-off",
}


def _integer(value: str, field: str) -> int:
    number = _number(value, field)
    if number.denominator != 1:
        raise ScoreInputError(f"Use a whole number for {field}.")
    return int(number)


def _number(value: str, field: str) -> Fraction:
    try:
        return Fraction(value)
    except (ValueError, ZeroDivisionError) as exc:
        raise ScoreInputError(f"Provide a valid number for {field}.") from exc


def _duration(element: ET.Element, divisions: Fraction | None) -> Fraction:
    if divisions is None:
        raise ScoreInputError("Set MusicXML divisions before the first duration.")
    duration = _number(element.findtext("duration", ""), "duration") / divisions
    if duration <= 0:
        raise ScoreInputError("Give each note, rest and forward movement a positive duration.")
    return duration


def _midi(note: ET.Element) -> int:
    pitch = note.find("pitch")
    if pitch is None:
        raise ScoreInputError("Use pitched notes or rests in the melody.")
    step = pitch.findtext("step", "").strip()
    if step not in _PITCH_CLASSES:
        raise ScoreInputError("Give each pitch a step from A to G.")
    octave = _integer(pitch.findtext("octave", ""), "pitch octave")
    alter = _integer(pitch.findtext("alter", "0"), "pitch alteration in semitones")
    midi = 12 * (octave + 1) + _PITCH_CLASSES[step] + alter
    if not 0 <= midi <= 127:
        raise ScoreInputError("Keep every sounding pitch within the MIDI range.")
    return midi


def _ties(note: ET.Element) -> set[str]:
    ties = {tie.get("type") for tie in note.findall("tie")}
    if not ties:
        ties = {tie.get("type") for tie in note.findall("notations/tied")}
    if not ties <= {"start", "stop", "continue", "let-ring"}:
        raise ScoreInputError("Mark ties with valid start and stop indications.")
    if "continue" in ties:
        ties.update(("start", "stop"))
    return ties & {"start", "stop"}


def _validate_navigation(root: ET.Element):
    if root.tag != "score-partwise":
        raise ScoreInputError("Export a partwise MusicXML score.")
    types = {element.tag for element in root.iter()}
    if types & {"repeat", "ending", "beat-repeat", "measure-repeat"} or any(
        _NAVIGATION_ATTRIBUTES.intersection(sound.attrib) for sound in root.iter("sound")
    ):
        raise ScoreInputError("Expand repeat signs, alternate endings and jumps before export.")
    if types & ({"grace", "cue"} | _UNSUPPORTED_MARKINGS):
        raise ScoreInputError("Write out grace notes and ornaments and remove cue notes before export.")


def _part(root: ET.Element) -> ET.Element:
    _validate_navigation(root)
    parts = root.findall("part")
    if len(parts) != 1:
        raise ScoreInputError("Export one melodic part.")
    if root.find(".//chord") is not None or root.find(".//backup") is not None:
        raise ScoreInputError("Export one melodic voice without chords or overlapping parts.")
    for transpose in root.iter("transpose"):
        if transpose.find("double") is not None or any(
            _number(transpose.findtext(field, "0"), field) != 0
            for field in ("chromatic", "diatonic", "octave-change")
        ):
            raise ScoreInputError("Export the part at concert pitch.")
    return parts[0]


def _read_attacks(part: ET.Element) -> list[_Attack]:
    attacks: list[_Attack] = []
    cursor = Fraction(0)
    divisions = None
    voice = None
    staff = None
    pending_tie = None

    for measure_index, measure in enumerate(part.findall("measure"), start=1):
        label = measure.get("number") or str(measure_index)
        if measure.get("implicit") != "yes":
            label = measure.get("text") or label
        ordinal = 0
        measure_start = cursor
        for element in measure:
            if element.tag == "attributes":
                new_divisions = element.findtext("divisions")
                if new_divisions is not None:
                    divisions = _number(new_divisions, "divisions")
                    if divisions <= 0:
                        raise ScoreInputError("Set MusicXML divisions to a positive value.")
                continue
            if element.tag not in {"note", "forward"}:
                continue

            duration = _duration(element, divisions)
            if element.tag == "note":
                note_voice = element.findtext("voice", "").strip()
                note_staff = element.findtext("staff", "").strip()
                if (voice and note_voice and voice != note_voice) or (
                    staff and note_staff and staff != note_staff
                ):
                    raise ScoreInputError("Export the melody in a single voice on one staff.")
                voice = voice or note_voice
                staff = staff or note_staff

            is_rest = element.tag == "forward" or element.find("rest") is not None
            if is_rest:
                if pending_tie is not None or _ties(element):
                    raise ScoreInputError(f"Complete the tie before the rest in measure {label}.")
                cursor += duration
                continue

            midi = _midi(element)
            ties = _ties(element)
            if pending_tie is not None:
                if "stop" not in ties or midi != pending_tie.midi:
                    raise ScoreInputError(f"Continue the tie on the same pitch in measure {label}.")
                pending_tie.duration += duration
                attack = pending_tie
            else:
                if "stop" in ties:
                    raise ScoreInputError(f"The tie in measure {label} needs a starting note.")
                ordinal += 1
                attack = _Attack(f"m{measure_index}n{ordinal}", label, cursor, duration, midi)
                attacks.append(attack)
            pending_tie = attack if "start" in ties else None
            cursor += duration
        if cursor == measure_start:
            raise ScoreInputError(f"Write out the notes or rests in measure {label} before export.")

    if pending_tie is not None:
        raise ScoreInputError("Include the ending note of the final tie.")
    if not attacks:
        raise ScoreInputError("Include at least one pitched note in the score.")
    return attacks


def _read_root(path):
    try:
        root = ET.parse(path).getroot()
    except (ET.ParseError, OSError, LookupError) as exc:
        raise ScoreInputError("Choose a readable, uncompressed MusicXML file.") from exc
    for element in root.iter():
        element.tag = element.tag.rsplit("}", 1)[-1]
    return root


def parse_score(path: str | Path) -> list[ScoreNote]:
    """Strict single-line importer for callers that already know their part."""
    root = _read_root(path)
    attacks = _read_attacks(_part(root))

    return [
        ScoreNote(
            id=attack.id,
            measure_label=attack.measure_label,
            onset_qn=float(attack.onset),
            duration_qn=float(attack.duration),
            midi=attack.midi,
        )
        for attack in attacks
    ]
