# Decisions

One file per decision, numbered in the order they were made. A decision is
anything a later reader would otherwise have to reverse-engineer from the diff:
why a layout divides the way it does, why a token exists, why an exception was
carved out.

Each file states the question, the options that were on the table, what was
chosen, **why**, and what it costs. Small decisions get short files — the point
is that the reasoning survives, not that the file is thorough.

Write one when the code alone would not answer "why is it like this?". Code that
speaks for itself needs a comment, not a decision file.
