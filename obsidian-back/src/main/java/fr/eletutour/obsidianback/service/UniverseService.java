package fr.eletutour.obsidianback.service;

import fr.eletutour.obsidianback.configuration.ObsidianProperties;
import fr.eletutour.obsidianback.model.NodeType;
import fr.eletutour.obsidianback.model.SpaceNode;
import fr.eletutour.obsidianback.model.Universe;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Stream;

@Service
public class UniverseService {

    private final List<String> exclude = List.of(".obsidian", "docs", "_assets");

    private final ObsidianProperties properties;

    public UniverseService(ObsidianProperties properties) {
        this.properties = properties;
    }

    public Universe buildUniverse() {

        Path vaultRoot = Path.of(
                properties.getVaultPath()
        );

        try (Stream<Path> stream = Files.list(vaultRoot)) {

            List<SpaceNode> children = stream
                    .sorted()
                    .map(path -> toNode(path, 0))
                    .filter(Objects::nonNull)
                    .filter(spaceNode -> !exclude.contains(spaceNode.name()))
                    .toList();

            return new Universe(
                    vaultRoot.getFileName().toString(),
                    children
            );

        } catch (IOException e) {
            throw new RuntimeException(
                    "Unable to scan vault",
                    e
            );
        }
    }

    private SpaceNode toNode(Path path, int depth) {
        try {
            if (Files.isDirectory(path)) {
                List<SpaceNode> children;
                try (Stream<Path> stream = Files.list(path)) {
                    children = stream
                            .sorted()
                            .map(child -> toNode(child, depth + 1))
                            .filter(Objects::nonNull)
                            .toList();
                }

                long markdownCount = children.stream()
                        .mapToLong(SpaceNode::markdownCount)
                        .sum();

                return new SpaceNode(
                        UUID.randomUUID().toString(),
                        path.getFileName().toString(),
                        path.toString(),
                        NodeType.DIRECTORY,
                        depth,
                        markdownCount,
                        children
                );
            }

            if (isMarkdown(path)) {
                return new SpaceNode(
                        UUID.randomUUID().toString(),
                        removeExtension(path.getFileName().toString()),
                        path.toString(),
                        NodeType.MARKDOWN_FILE,
                        depth,
                        1,
                        List.of()
                );
            }
            return null;
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private boolean isMarkdown(Path path) {

        return Files.isRegularFile(path)
                && path.getFileName()
                .toString()
                .toLowerCase()
                .endsWith(".md");
    }

    private String removeExtension(String fileName) {

        int index = fileName.lastIndexOf('.');

        return index > 0
                ? fileName.substring(0, index)
                : fileName;
    }
}