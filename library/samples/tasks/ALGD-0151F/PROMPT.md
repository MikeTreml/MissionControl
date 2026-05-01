Backfill the volatility model with the Q3 options chain.

Pull from the new tick-data feed, normalize against the existing
expiry/strike index, and run the model end-to-end on the back-filled
window. Report any drift vs. the live model on overlapping days.
