package fr.eletutour.obsidianback.parser;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class NoteParserTest {

    @Test
    void tagsDuFrontmatterSousToutesLesFormes() {
        assertThat(NoteParser.parse("---\ntags: [java, spring]\n---\ncorps").tags()).containsExactly("java", "spring");
        assertThat(NoteParser.parse("---\ntags: java, \"spring boot\"\n---\n").tags()).contains("java");
        assertThat(NoteParser.parse("---\ntitle: x\ntags:\n  - java\n  - 'tests'\nautre: y\n---\n").tags())
                .containsExactly("java", "tests");
        assertThat(NoteParser.parse("---\ntag: solo\n---\n").tags()).containsExactly("solo");
    }

    @Test
    void tagsDansLeTexteSansDoublonNiFauxPositif() {
        String md = """
                # Titre
                Un texte #Java et #java encore, #spring/boot, mais pas #123 ni http://x.fr/#ancre.
                ```
                #pasUnTag dans du code
                ```
                Et `#pasNonPlus` en ligne.
                """;
        assertThat(NoteParser.parse(md).tags()).containsExactly("Java", "spring/boot");
    }

    @Test
    void extraitLisibleSansSyntaxeMarkdown() {
        String md = "---\ntags: [a]\n---\n# Mon titre\n\nVoir [[Autre note|cette note]] et [le site](https://x.fr), **gras** et `code`.\n- un point\n> une citation";
        NoteParser.ParsedNote n = NoteParser.parse(md);
        assertThat(n.excerpt()).isEqualTo("Mon titre Voir cette note et le site, gras et . un point une citation");
        assertThat(n.words()).isEqualTo(15);
    }

    @Test
    void extraitCoupeSurUnMotEtVidePourUneNoteVide() {
        String longText = "mot ".repeat(200);
        String excerpt = NoteParser.parse(longText).excerpt();
        assertThat(excerpt).endsWith("…");
        assertThat(excerpt.length()).isLessThanOrEqualTo(NoteParser.EXCERPT_LENGTH + 1);
        assertThat(excerpt).doesNotContain("mo…");
        assertThat(NoteParser.parse("").excerpt()).isNull();
        assertThat(NoteParser.parse("---\ntags: [a]\n---\n").words()).isZero();
    }

    @Test
    void liensWikiIdentiquesAuComportementHistorique() {
        String md = "---\nrelated: \"[[Dans le frontmatter]]\"\n---\n[[Cible]] [[Dossier/Autre#Titre|alias]] [[Encore|x]]";
        assertThat(NoteParser.parse(md).linkTargets())
                .containsExactly("Dans le frontmatter", "Cible", "Dossier/Autre", "Encore");
    }
}
