from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth.models import User
from app.dependencies import get_current_user
from app.files import service
from app.files.schemas import (
    UploadInitRequest, UploadManifest,
    UploadCompleteRequest, FileResponse, FileDetailResponse, DownloadManifest,
)

router = APIRouter(prefix="/files", tags=["files"])


@router.post("/upload/init", response_model=UploadManifest)
async def upload_init(
    body: UploadInitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    ):
    try:
        manifest = await service.init_upload(
            db,
            str(current_user.id),
            body.filename,
            body.size_bytes,
            body.mime_type,
            body.replication_factor,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return manifest


@router.post("/upload/complete", response_model=FileResponse)
async def upload_complete(
    body: UploadCompleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        file = await service.complete_upload(db, str(current_user.id), body.file_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return FileResponse(
        id=str(file.id),
        original_name=file.original_name,
        size_bytes=file.size_bytes,
        mime_type=file.mime_type,
        chunk_count=file.chunk_count,
        replication_factor=file.replication_factor,
        status=file.status,
        created_at=file.created_at,
    )


@router.get("", response_model=list[FileResponse])
async def list_files(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_files(db, str(current_user.id))


@router.get("/{file_id}", response_model=FileDetailResponse)
async def get_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    detail = await service.get_file_detail(db, str(current_user.id), file_id)
    if not detail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return detail


@router.get("/{file_id}/download-manifest", response_model=DownloadManifest)
async def download_manifest(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    manifest = await service.get_download_manifest(db, str(current_user.id), file_id)
    if not manifest:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="File unavailable: no active nodes hold all chunks",
        )
    return manifest


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await service.delete_file(db, str(current_user.id), file_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")


@router.post("/chunks/{chunk_id}/upload", status_code=status.HTTP_200_OK)
async def upload_chunk_via_backend(
    chunk_id: str,
    request: Request,
    x_chunk_hash: str = Header(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    body = await request.body()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty chunk body")

    try:
        result = await service.relay_chunk_upload(
            db=db,
            user_id=str(current_user.id),
            chunk_id=chunk_id,
            encrypted_data=body,
            sha256_hash=x_chunk_hash,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return result


@router.get("/chunks/{chunk_id}/download")
async def download_chunk_via_backend(
    chunk_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        payload, sha256_hash = await service.relay_chunk_download(
            db=db,
            user_id=str(current_user.id),
            chunk_id=chunk_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return Response(
        content=payload,
        media_type="application/octet-stream",
        headers={"X-Chunk-Hash": sha256_hash},
    )
