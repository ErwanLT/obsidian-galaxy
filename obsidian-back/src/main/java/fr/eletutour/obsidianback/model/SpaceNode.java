package fr.eletutour.obsidianback.model;

import java.util.List;

public record SpaceNode(

        String id,
        String name,
        String path,
        NodeType type,
        int depth,
        long markdownCount,
        List<SpaceNode> children

) {
}