import { useEffect, useMemo, useState } from "react";
import { useSubscribe } from "./data-bus";
export function useLibraryIndex() {
    const [index, setIndex] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState("");
    const [kindFilter, setKindFilter] = useState(new Set());
    const [languageFilter, setLanguageFilter] = useState(new Set());
    const [sourceFilter, setSourceFilter] = useState(new Set());
    const [containerKindFilter, setContainerKindFilter] = useState(new Set());
    const [tagFilter, setTagFilter] = useState(new Set());
    const [rebuilding, setRebuilding] = useState(false);
    async function load() {
        try {
            setLoading(true);
            setError(null);
            if (!window.mc) {
                setIndex(null);
                setItems([]);
                return;
            }
            const next = await window.mc.getLibraryIndex();
            setIndex(next);
            setItems(next.items ?? []);
        }
        catch (e) {
            setError(e instanceof Error ? e : new Error(String(e)));
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void load();
    }, []);
    // Re-fetch after a workflow is created (or any future workflow mutation).
    useSubscribe("workflows", () => { void load(); });
    /**
     * Re-walk the library tree in-process via the main-side
     * LibraryWalker, write back `_index.json`, and update local state
     * with the fresh result. Distinct from `refresh` (which only
     * re-reads the cached file) — call this when items have been
     * added or removed on disk and we want them to surface in MC
     * without restarting the app.
     */
    async function rebuild() {
        if (!window.mc?.refreshLibraryIndex)
            return;
        try {
            setRebuilding(true);
            setError(null);
            const next = await window.mc.refreshLibraryIndex();
            setIndex(next);
            setItems(next.items ?? []);
        }
        catch (e) {
            setError(e instanceof Error ? e : new Error(String(e)));
        }
        finally {
            setRebuilding(false);
        }
    }
    function toggleKind(kind) {
        setKindFilter((prev) => {
            const next = new Set(prev);
            if (next.has(kind))
                next.delete(kind);
            else
                next.add(kind);
            return next;
        });
    }
    const toggleLanguage = makeSetToggle(setLanguageFilter);
    const toggleSource = makeSetToggle(setSourceFilter);
    const toggleContainerKind = makeSetToggle(setContainerKindFilter);
    const toggleTag = makeSetToggle(setTagFilter);
    const facets = useMemo(() => {
        const languages = new Set();
        const sources = new Set();
        const containerKinds = new Set();
        const tags = new Set();
        for (const item of items) {
            for (const lang of item.languages ?? [])
                languages.add(lang);
            if (item.originalSource?.repo)
                sources.add(item.originalSource.repo);
            if (item.containerKind)
                containerKinds.add(item.containerKind);
            for (const tag of item.tags ?? [])
                tags.add(tag);
        }
        return {
            languages: [...languages].sort().slice(0, 30),
            sources: [...sources].sort().slice(0, 20),
            containerKinds: [...containerKinds].sort().slice(0, 20),
            tags: [...tags].sort().slice(0, 40),
        };
    }, [items]);
    const filteredItems = useMemo(() => {
        const q = search.trim().toLowerCase();
        const query = parseSearchQuery(q);
        return items.filter((item) => {
            if (kindFilter.size > 0 && !kindFilter.has(item.kind))
                return false;
            if (query.kind && item.kind !== query.kind)
                return false;
            if (query.language && !(item.languages ?? []).map((x) => x.toLowerCase()).includes(query.language))
                return false;
            if (languageFilter.size > 0 && !(item.languages ?? []).some((x) => languageFilter.has(x)))
                return false;
            if (sourceFilter.size > 0 && !sourceFilter.has(item.originalSource?.repo ?? ""))
                return false;
            if (containerKindFilter.size > 0 && !containerKindFilter.has(item.containerKind ?? ""))
                return false;
            if (tagFilter.size > 0 && !(item.tags ?? []).some((x) => tagFilter.has(x)))
                return false;
            if (!query.text)
                return true;
            const haystack = [
                item.id,
                item.name,
                item.description ?? "",
                item.logicalPath,
                item.role ?? "",
                item.originalSource?.repo ?? "",
                ...(item.tags ?? []),
                ...(item.languages ?? []),
                ...(item.expertise ?? []),
            ]
                .join(" ")
                .toLowerCase();
            return haystack.includes(query.text);
        });
    }, [items, kindFilter, languageFilter, sourceFilter, containerKindFilter, tagFilter, search]);
    return {
        index,
        items,
        loading,
        error,
        search,
        setSearch,
        kindFilter,
        toggleKind,
        languageFilter,
        sourceFilter,
        containerKindFilter,
        tagFilter,
        toggleLanguage,
        toggleSource,
        toggleContainerKind,
        toggleTag,
        facets,
        filteredItems,
        refresh: load,
        rebuild,
        rebuilding,
    };
}
function makeSetToggle(setter) {
    return (value) => {
        setter((prev) => {
            const next = new Set(prev);
            if (next.has(value))
                next.delete(value);
            else
                next.add(value);
            return next;
        });
    };
}
function parseSearchQuery(raw) {
    const tokens = raw.split(/\s+/).filter(Boolean);
    let kind = null;
    let language = null;
    const textTokens = [];
    for (const token of tokens) {
        if (token.startsWith("agent:")) {
            kind = "agent";
            textTokens.push(token.slice("agent:".length));
            continue;
        }
        if (token.startsWith("skill:")) {
            kind = "skill";
            textTokens.push(token.slice("skill:".length));
            continue;
        }
        if (token.startsWith("workflow:")) {
            kind = "workflow";
            textTokens.push(token.slice("workflow:".length));
            continue;
        }
        if (token.startsWith("example:")) {
            kind = "example";
            textTokens.push(token.slice("example:".length));
            continue;
        }
        if (token.startsWith("language:")) {
            language = token.slice("language:".length);
            continue;
        }
        textTokens.push(token);
    }
    return { kind, language, text: textTokens.join(" ").trim() };
}
