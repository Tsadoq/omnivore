package app.omnivore.omnivore.core.network

import android.util.Log
import app.omnivore.omnivore.core.database.entities.Highlight
import app.omnivore.omnivore.core.database.entities.SavedItem
import app.omnivore.omnivore.core.database.entities.SavedItemLabel
import app.omnivore.omnivore.graphql.generated.GetArticleQuery
import app.omnivore.omnivore.graphql.generated.type.ContentReader
import java.io.File
import java.net.URL
import java.nio.file.Files
import java.nio.file.StandardCopyOption

data class SavedItemQueryResponse(
    val item: SavedItem?,
    val highlights: List<Highlight>,
    val labels: List<SavedItemLabel>,
    val state: String
) {
    companion object {
        fun emptyResponse(): SavedItemQueryResponse {
            return SavedItemQueryResponse(null, listOf(), listOf(), state = "")
        }
    }
}

suspend fun Networker.savedItem(slug: String): SavedItemQueryResponse {
    try {
        val result = authenticatedApolloClient().query(
            GetArticleQuery(slug = slug)
        ).execute()

        val article = result.data?.article?.onArticleSuccess?.article
            ?: return SavedItemQueryResponse.emptyResponse()

        val labels = article.labels ?: listOf()

        val savedItemLabels = labels.map {
            SavedItemLabel(
                savedItemLabelId = it.labelFields.id,
                name = it.labelFields.name,
                color = it.labelFields.color,
                createdAt = it.labelFields.createdAt as String?,
                labelDescription = it.labelFields.description
            )
        }

        val highlights = article.highlights.map {
//      val updatedAtString = it.highlightFields.updatedAt as? String

            Highlight(
                highlightId = it.highlightFields.id,
                type = it.highlightFields.type.toString(),
                shortId = it.highlightFields.shortId,
                quote = it.highlightFields.quote,
                prefix = it.highlightFields.prefix,
                suffix = it.highlightFields.suffix,
                patch = it.highlightFields.patch,
                annotation = it.highlightFields.annotation,
                createdAt = it.highlightFields.createdAt as String?,
                updatedAt = it.highlightFields.updatedAt as String?,
                createdByMe = it.highlightFields.createdByMe,
                color = it.highlightFields.color,
                highlightPositionPercent = it.highlightFields.highlightPositionPercent,
                highlightPositionAnchorIndex = it.highlightFields.highlightPositionAnchorIndex
            )
        }

        var localPDFPath: String? = null
        if (article.articleFields.contentReader == ContentReader.PDF) {
            // download the PDF and save it locally
            // article.articleFields.url

            val localFile = File.createTempFile("pdf-" + article.articleFields.id, ".pdf")
            val url = URL(article.articleFields.url)
            Log.d("pdf", "creating local file: $localFile")

            url.openStream()
                .use { Files.copy(it, localFile.toPath(), StandardCopyOption.REPLACE_EXISTING) }
            localPDFPath = localFile.toPath().toString()
        }

        saveLibraryItemContentToFile(article.articleFields.id, article.articleFields.content)

        val savedItem = SavedItem(
            savedItemId = article.articleFields.id,
            title = article.articleFields.title,
            folder = article.articleFields.folder,
            createdAt = article.articleFields.createdAt as String,
            savedAt = article.articleFields.savedAt as String,
            readAt = article.articleFields.readAt as String?,
            updatedAt = article.articleFields.updatedAt as String?,
            readingProgress = article.articleFields.readingProgressPercent,
            readingProgressAnchor = article.articleFields.readingProgressAnchorIndex,
            imageURLString = article.articleFields.image,
            pageURLString = article.articleFields.url,
            descriptionText = article.articleFields.description,
            publisherURLString = article.articleFields.originalArticleUrl,
            siteName = article.articleFields.siteName,
            author = article.articleFields.author,
            publishDate = article.articleFields.publishedAt as String?,
            slug = article.articleFields.slug,
            isArchived = article.articleFields.isArchived,
            contentReader = article.articleFields.contentReader.rawValue,
            wordsCount = article.articleFields.wordsCount,
            localPDFPath = localPDFPath
        )

        return SavedItemQueryResponse(
            item = savedItem,
            highlights,
            labels = savedItemLabels,
            state = article.articleFields.state?.rawValue ?: ""
        )
    } catch (e: java.lang.Exception) {
        return SavedItemQueryResponse(item = null, listOf(), labels = listOf(), state = "")
    }
}
