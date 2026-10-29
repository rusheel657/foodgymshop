#!/bin/sh
# Regenerates every Android icon + splash PNG from foreground.svg. Needs rsvg-convert (brew install librsvg).
set -e
cd "$(dirname "$0")"
RES=../../android/app/src/main/res
GLYPH=$(sed -n '/<svg/,/<\/svg>/p' foreground.svg | sed '1d;$d')
T=$(mktemp -d)
# Same glyph, cropped tighter (legacy icons have no 108→66 safe-zone padding) on a black square / circle.
wrap() { printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s">%s%s</svg>' "$1" "$2" "$GLYPH"; }
wrap "16 16 76 76" '<rect x="16" y="16" width="76" height="76" fill="#000"/>' > "$T/legacy.svg"
wrap "16 16 76 76" '<circle cx="54" cy="54" r="38" fill="#000"/>' > "$T/round.svg"
for d in mdpi:1 hdpi:1.5 xhdpi:2 xxhdpi:3 xxxhdpi:4; do
  n=${d%%:*}; s=${d##*:}
  px() { awk "BEGIN{print int($1*$s)}"; }
  rsvg-convert -w "$(px 48)" "$T/legacy.svg" -o "$RES/mipmap-$n/ic_launcher.png"
  rsvg-convert -w "$(px 48)" "$T/round.svg" -o "$RES/mipmap-$n/ic_launcher_round.png"
  rsvg-convert -w "$(px 108)" foreground.svg -o "$RES/mipmap-$n/ic_launcher_foreground.png"
done
# Splash screens: glyph centred on black, sized to 40% of the short side.
for f in "$RES"/drawable*/splash.png; do
  w=$(sips -g pixelWidth "$f" | awk '/pixelWidth/{print $2}'); h=$(sips -g pixelHeight "$f" | awk '/pixelHeight/{print $2}')
  g=$(awk "BEGIN{m=($w<$h?$w:$h); print int(m*0.4)}")
  printf '<svg xmlns="http://www.w3.org/2000/svg" width="%s" height="%s"><rect width="100%%" height="100%%" fill="#000"/><svg x="%s" y="%s" width="%s" height="%s" viewBox="16 16 76 76">%s</svg></svg>' \
    "$w" "$h" $(((w-g)/2)) $(((h-g)/2)) "$g" "$g" "$GLYPH" > "$T/splash.svg"
  rsvg-convert "$T/splash.svg" -o "$f"
done
rm -r "$T"
