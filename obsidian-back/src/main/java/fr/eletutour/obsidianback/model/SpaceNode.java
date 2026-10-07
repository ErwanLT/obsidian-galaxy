package fr.eletutour.obsidianback.model;

import java.util.List;
import java.util.Map;

public record SpaceNode(

        String id,
        String name,
        String path,
        NodeType type,
        int depth,
        long markdownCount,
        long size,
        List<String> links,
        List<SpaceNode> children,
        // Champs ajoutés (les clients existants les ignorent) :
        List<String> tags,      // note : tags du frontmatter et #tags du texte ; dossier : vide
        String excerpt,         // note : début du texte sans syntaxe Markdown ; dossier : null
        long words,             // note : nombre de mots ; dossier : total de ses notes
        long created,           // epoch ms ; dossier : plus ancienne création de ses notes
        long modified,          // epoch ms ; dossier : dernière modification de ses notes
        Map<String, String> properties  // note : valeurs simples du frontmatter (published_at, status…) ; dossier : vide

) {
}