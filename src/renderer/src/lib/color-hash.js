/**
 * Deterministic color from a short string. Same input always yields the same
 * color, so "DA" is always the same shade across sessions / machines.
 *
 * Used for project chips in the sidebar. Hue is hashed; saturation + lightness
 * are fixed so every chip reads well on the dark theme.
 */
export function colorForKey(key) {
    if (!key)
        return "hsl(220, 15%, 45%)"; // neutral default
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = key.charCodeAt(i) + ((hash << 5) - hash);
        hash |= 0; // 32-bit integer
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 55%, 50%)`;
}
/** Darker variant of the same hue for the chip border. */
export function colorForKeyBorder(key) {
    if (!key)
        return "hsl(220, 15%, 30%)";
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = key.charCodeAt(i) + ((hash << 5) - hash);
        hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 60%, 35%)`;
}
