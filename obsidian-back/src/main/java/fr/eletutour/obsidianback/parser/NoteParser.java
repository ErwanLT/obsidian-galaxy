package fr.eletutour.obsidianback.parser;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Analyse le contenu d'une note Markdown (format Obsidian) : liens wiki,
 * tags (frontmatter et #tags dans le texte), extrait lisible et nombre de mots.
 * Sans état et sans accès disque : testable directement sur une chaîne.
 */
public final class NoteParser {

    public static final int EXCERPT_LENGTH = 280;

    // [[Cible]], [[Cible|Alias]], [[Cible#Titre|Alias]]
    private static final Pattern WIKI_LINK = Pattern.compile("\\[\\[([^\\]|#]+)(?:#[^\\]|]*)?(?:\\|([^\\]]*))?\\]\\]");
    // #tag : précédé d'un début de ligne ou d'un espace, au moins une lettre (pas « #123 »)
    private static final Pattern INLINE_TAG = Pattern.compile("(?<=^|\\s)#([\\p{L}\\p{N}_/-]*[\\p{L}_][\\p{L}\\p{N}_/-]*)");
    private static final Pattern CODE_FENCE = Pattern.compile("(?s)```.*?(```|$)|~~~.*?(~~~|$)");
    private static final Pattern INLINE_CODE = Pattern.compile("`[^`]*`");
    private static final Pattern IMAGE = Pattern.compile("!\\[\\[[^\\]]*\\]\\]|!\\[[^\\]]*\\]\\([^)]*\\)");
    private static final Pattern MD_LINK = Pattern.compile("\\[([^\\]]*)\\]\\([^)]*\\)");
    private static final Pattern HTML_TAG = Pattern.compile("<[^>]+>");
    private static final Pattern LINE_MARKUP = Pattern.compile("(?m)^\\s{0,3}(#{1,6}\\s+|>\\s?|[-*+]\\s+\\[[ xX]\\]\\s+|[-*+]\\s+|\\d+[.)]\\s+)");
    private static final Pattern EMPHASIS = Pattern.compile("(\\*\\*|__|\\*|_|~~|==)");
    private static final Pattern RULE = Pattern.compile("(?m)^\\s*([-*_]\\s*){3,}$");
    private static final Pattern TABLE_PIPES = Pattern.compile("\\|");
    private static final Pattern SPACES = Pattern.compile("\\s+");

    private NoteParser() {
    }

    public record ParsedNote(List<String> linkTargets, List<String> tags, String excerpt, long words) {
    }

    public static ParsedNote parse(String content) {
        String text = content == null ? "" : content.replace("\r\n", "\n");
        Frontmatter fm = splitFrontmatter(text);
        String body = fm.body();

        // Liens : sur tout le fichier, frontmatter compris (comportement historique de l'API).
        List<String> targets = new ArrayList<>();
        Matcher links = WIKI_LINK.matcher(text);
        while (links.find()) {
            targets.add(links.group(1).trim());
        }

        // Tags : frontmatter d'abord, puis texte hors blocs de code ; sans doublon (casse ignorée).
        Map<String, String> tags = new LinkedHashMap<>();
        for (String t : fm.tags()) {
            addTag(tags, t);
        }
        String withoutFences = CODE_FENCE.matcher(body).replaceAll(" ");
        String withoutCode = INLINE_CODE.matcher(withoutFences).replaceAll(" ");
        Matcher inline = INLINE_TAG.matcher(withoutCode);
        while (inline.find()) {
            addTag(tags, inline.group(1));
        }

        // Le code en ligne garde son texte dans l'extrait (« avec @Async, offre… »).
        String plain = plainText(withoutFences);
        long words = plain.isBlank() ? 0 : SPACES.split(plain.trim()).length;
        return new ParsedNote(List.copyOf(targets), List.copyOf(tags.values()), excerpt(plain), words);
    }

    private static void addTag(Map<String, String> tags, String raw) {
        String t = raw.trim();
        while (t.startsWith("#")) {
            t = t.substring(1);
        }
        if (!t.isEmpty()) {
            tags.putIfAbsent(t.toLowerCase(Locale.ROOT), t);
        }
    }

    /** Texte lisible : syntaxe Markdown retirée, liens réduits à leur libellé. */
    static String plainText(String body) {
        String s = INLINE_CODE.matcher(body).replaceAll(m -> Matcher.quoteReplacement(m.group().replace("`", "")));
        s = IMAGE.matcher(s).replaceAll(" ");
        Matcher wiki = WIKI_LINK.matcher(s);
        StringBuilder sb = new StringBuilder();
        while (wiki.find()) {
            String label = wiki.group(2) != null && !wiki.group(2).isBlank() ? wiki.group(2) : wiki.group(1);
            wiki.appendReplacement(sb, Matcher.quoteReplacement(label.trim()));
        }
        wiki.appendTail(sb);
        s = MD_LINK.matcher(sb.toString()).replaceAll("$1");
        s = HTML_TAG.matcher(s).replaceAll(" ");
        s = RULE.matcher(s).replaceAll(" ");
        s = LINE_MARKUP.matcher(s).replaceAll("");
        s = INLINE_TAG.matcher(s).replaceAll(" ");
        s = EMPHASIS.matcher(s).replaceAll("");
        s = TABLE_PIPES.matcher(s).replaceAll(" ");
        return SPACES.matcher(s).replaceAll(" ").trim();
    }

    /** Début du texte, coupé sur une fin de mot. Null si la note est vide. */
    static String excerpt(String plain) {
        if (plain.isBlank()) {
            return null;
        }
        if (plain.length() <= EXCERPT_LENGTH) {
            return plain;
        }
        int cut = plain.lastIndexOf(' ', EXCERPT_LENGTH);
        if (cut < EXCERPT_LENGTH / 2) {
            cut = EXCERPT_LENGTH;
        }
        return plain.substring(0, cut).replaceAll("[\\s,;:.!?–-]+$", "") + "…";
    }

    record Frontmatter(List<String> tags, String body) {
    }

    /**
     * Sépare le frontmatter YAML (entre deux lignes « --- ») du corps, et en lit
     * les tags sous leurs formes courantes : « tags: [a, b] », « tags: a, b »,
     * « tags: a » ou une liste « - a » sur les lignes suivantes.
     */
    static Frontmatter splitFrontmatter(String text) {
        if (!text.startsWith("---\n")) {
            return new Frontmatter(List.of(), text);
        }
        int end = text.indexOf("\n---", 4);
        if (end < 0) {
            return new Frontmatter(List.of(), text);
        }
        String yaml = text.substring(4, end);
        int bodyStart = text.indexOf('\n', end + 4);
        String body = bodyStart < 0 ? "" : text.substring(bodyStart + 1);

        List<String> tags = new ArrayList<>();
        String[] lines = yaml.split("\n");
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            String lower = line.toLowerCase(Locale.ROOT);
            if (!(lower.startsWith("tags:") || lower.startsWith("tag:"))) {
                continue;
            }
            String value = line.substring(line.indexOf(':') + 1).trim();
            if (!value.isEmpty()) {
                value = value.replaceAll("^\\[|\\]$", "");
                for (String part : value.split("[,\\s]+")) {
                    String t = part.replaceAll("^[\"']|[\"']$", "").trim();
                    if (!t.isEmpty()) {
                        tags.add(t);
                    }
                }
            } else {
                while (i + 1 < lines.length && lines[i + 1].trim().startsWith("- ")) {
                    i++;
                    String t = lines[i].trim().substring(2).replaceAll("^[\"']|[\"']$", "").trim();
                    if (!t.isEmpty()) {
                        tags.add(t);
                    }
                }
            }
        }
        return new Frontmatter(tags, body);
    }
}
