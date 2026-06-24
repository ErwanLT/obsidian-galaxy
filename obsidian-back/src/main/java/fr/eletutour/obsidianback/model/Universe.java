package fr.eletutour.obsidianback.model;

import java.util.List;

public record Universe(
        String name,
        List<SpaceNode> children
) {
}