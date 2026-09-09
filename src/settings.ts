import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

class AnalysisCard extends formattingSettings.SimpleCard {
  name = "analysis";
  displayNameKey = "Analysis";
  unit = new formattingSettings.TextInput({ name: "unit", displayNameKey: "Unit", descriptionKey: "UnitHelp", value: "", placeholder: "hours / FTE" });
  additiveTotals = new formattingSettings.ToggleSwitch({ name: "additiveTotals", displayNameKey: "AdditiveTotals", descriptionKey: "TotalsHelp", value: false });
  slices = [this.unit, this.additiveTotals];
}
class LayoutCard extends formattingSettings.SimpleCard {
  name = "layout";
  displayNameKey = "Layout";
  cellWidth = new formattingSettings.NumUpDown({ name: "cellWidth", displayNameKey: "CellWidth", value: 132 });
  fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayNameKey: "FontSize", value: 12 });
  rtl = new formattingSettings.ToggleSwitch({ name: "rtl", displayNameKey: "Rtl", value: false });
  slices = [this.cellWidth, this.fontSize, this.rtl];
}
export class Settings extends formattingSettings.Model {
  analysis = new AnalysisCard();
  layout = new LayoutCard();
  cards = [this.analysis, this.layout];
}
export const clampSetting = (value: number, min: number, max: number, fallback: number): number =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
