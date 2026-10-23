package com.lor4ai.brainwave

import android.app.Activity
import android.content.Intent
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class AttachmentArgs { lateinit var path: String }

@TauriPlugin
class AttachmentsPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun open(invoke: Invoke) {
        try {
            val file = File(invoke.parseArgs(AttachmentArgs::class.java).path).canonicalFile
            val allowed = File(activity.cacheDir, "attachment-preview").canonicalFile
            require(file.path.startsWith(allowed.path + File.separator) && file.isFile)
            val uri = FileProvider.getUriForFile(activity, activity.packageName + ".fileprovider", file)
            val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.extension.lowercase()) ?: "application/octet-stream"
            val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            activity.startActivity(Intent.createChooser(intent, file.name).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
            invoke.resolve()
        } catch (error: Exception) { invoke.reject("attachmentUnavailable") }
    }
}
