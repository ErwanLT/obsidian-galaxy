package fr.eletutour.obsidianback.service;

import fr.eletutour.obsidianback.configuration.ObsidianProperties;
import fr.eletutour.obsidianback.model.NodeType;
import fr.eletutour.obsidianback.model.SpaceNode;
import fr.eletutour.obsidianback.model.Universe;
import fr.eletutour.obsidianback.parser.NoteParser;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;

@Service
public class UniverseService {

    private final List<String> exclude = List.of(".obsidian", "docs", "_assets");

    private final ObsidianProperties properties;

    // Analyse des notes mise en cache : une note n'est relue que si sa date de
    // modification ou sa taille a changé (l'analyse du texte est la partie coûteuse).
    private record CachedNote(long modified, long size, NoteParser.ParsedNote parsed) {
    }

    private final Map<String, CachedNote> parsedCache = new ConcurrentHashMap<>();

    public UniverseService(ObsidianProperties properties) {
        this.properties = properties;
    }

    public Universe buildUniverse() {
        Path vaultRoot = Path.of(properties.getVaultPath());

        Map<String, String> index = new HashMap<>();
        walkAndIndex(vaultRoot, index);

        try (Stream<Path> stream = Files.list(vaultRoot)) {
            List<SpaceNode> children = stream
                    .sorted()
                    .map(path -> toNode(path, 0, index))
                    .filter(Objects::nonNull)
                    .filter(spaceNode -> !exclude.contains(spaceNode.name()))
                    .toList();

            return new Universe(
                    vaultRoot.getFileName().toString(),
                    children
            );

        } catch (IOException e) {
            throw new RuntimeException("Unable to scan vault", e);
        }
    }

    private void walkAndIndex(Path path, Map<String, String> index) {
        if (exclude.contains(path.getFileName().toString())) {
            return;
        }
        if (Files.isDirectory(path)) {
            try (Stream<Path> stream = Files.list(path)) {
                stream.forEach(child -> walkAndIndex(child, index));
            } catch (IOException e) {
                // Ignore
            }
        } else if (isMarkdown(path)) {
            String name = removeExtension(path.getFileName().toString()).toLowerCase();
            index.put(name, path.toAbsolutePath().toString());
        }
    }

    private SpaceNode toNode(Path path, int depth, Map<String, String> index) {
        try {
            if (Files.isDirectory(path)) {
                List<SpaceNode> children;
                try (Stream<Path> stream = Files.list(path)) {
                    children = stream
                            .sorted()
                            .map(child -> toNode(child, depth + 1, index))
                            .filter(Objects::nonNull)
                            .toList();
                }

                long markdownCount = children.stream()
                        .mapToLong(SpaceNode::markdownCount)
                        .sum();

                long size = children.stream()
                        .mapToLong(SpaceNode::size)
                        .sum();

                long words = children.stream().mapToLong(SpaceNode::words).sum();
                long created = children.stream().mapToLong(SpaceNode::created).filter(t -> t > 0).min().orElse(0);
                long modified = children.stream().mapToLong(SpaceNode::modified).max().orElse(0);

                return new SpaceNode(
                        UUID.randomUUID().toString(),
                        path.getFileName().toString(),
                        path.toString(),
                        NodeType.DIRECTORY,
                        depth,
                        markdownCount,
                        size,
                        List.of(),
                        children,
                        List.of(),
                        null,
                        words,
                        created,
                        modified,
                        Map.of()
                );
            }

            if (isMarkdown(path)) {
                BasicFileAttributes attrs = Files.readAttributes(path, BasicFileAttributes.class);
                NoteParser.ParsedNote parsed = parseCached(path, attrs);
                List<String> links = resolveLinks(path, parsed.linkTargets(), index);

                return new SpaceNode(
                        UUID.randomUUID().toString(),
                        removeExtension(path.getFileName().toString()),
                        path.toString(),
                        NodeType.MARKDOWN_FILE,
                        depth,
                        1,
                        attrs.size(),
                        links,
                        List.of(),
                        parsed.tags(),
                        parsed.excerpt(),
                        parsed.words(),
                        attrs.creationTime().toMillis(),
                        attrs.lastModifiedTime().toMillis(),
                        parsed.properties()
                );
            }
            return null;
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private NoteParser.ParsedNote parseCached(Path path, BasicFileAttributes attrs) {
        String key = path.toAbsolutePath().toString();
        long modified = attrs.lastModifiedTime().toMillis();
        CachedNote cached = parsedCache.get(key);
        if (cached != null && cached.modified() == modified && cached.size() == attrs.size()) {
            return cached.parsed();
        }
        NoteParser.ParsedNote parsed = NoteParser.parse(readQuietly(path));
        parsedCache.put(key, new CachedNote(modified, attrs.size(), parsed));
        return parsed;
    }

    private String readQuietly(Path path) {
        try {
            return Files.readString(path);
        } catch (IOException e) {
            return "";
        }
    }

    private List<String> resolveLinks(Path path, List<String> targets, Map<String, String> index) {
        List<String> links = new ArrayList<>();
        String self = path.toAbsolutePath().toString();
        for (String target : targets) {
            String resolvedPath = resolveLink(target, index);
            if (resolvedPath != null && !resolvedPath.equals(self)) {
                links.add(resolvedPath);
            }
        }
        return links;
    }

    private String resolveLink(String target, Map<String, String> index) {
        String targetName = target;
        int lastSlash = target.lastIndexOf('/');
        if (lastSlash != -1) {
            targetName = target.substring(lastSlash + 1);
        }
        String targetKey = targetName.toLowerCase();
        if (targetKey.endsWith(".md")) {
            targetKey = targetKey.substring(0, targetKey.length() - 3);
        }

        String absolutePath = index.get(targetKey);
        if (absolutePath != null) {
            return absolutePath;
        }

        // Try suffix matching (relative path suffix)
        String targetSuffix = target.toLowerCase();
        if (!targetSuffix.endsWith(".md")) {
            targetSuffix += ".md";
        }
        for (Map.Entry<String, String> entry : index.entrySet()) {
            String pathStr = entry.getValue().toLowerCase();
            if (pathStr.endsWith(targetSuffix)) {
                return entry.getValue();
            }
        }

        return null;
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