//go:build windows

package storage

import (
	"syscall"
	"unsafe"
)

func diskFreeBytes(path string) int64 {
	_, free, _ := getDiskSpaceEx(path)
	return free
}

func diskTotalBytes(path string) int64 {
	total, _, _ := getDiskSpaceEx(path)
	return total
}

func getDiskSpaceEx(path string) (total, free, totalFree int64) {
	pathPtr, _ := syscall.UTF16PtrFromString(path)
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getDiskFreeExW := kernel32.NewProc("GetDiskFreeSpaceExW")

	var freeBytesAvailable, totalBytes, totalFreeBytes uint64
	getDiskFreeExW.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		uintptr(unsafe.Pointer(&totalBytes)),
		uintptr(unsafe.Pointer(&totalFreeBytes)),
	)
	return int64(totalBytes), int64(freeBytesAvailable), int64(totalFreeBytes)
}

func protectFile(path string) error {
	pathPtr, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return err
	}
	// FILE_ATTRIBUTE_READONLY = 1, FILE_ATTRIBUTE_HIDDEN = 2, FILE_ATTRIBUTE_SYSTEM = 4
	return syscall.SetFileAttributes(pathPtr, 1|2|4)
}

func unprotectFile(path string) error {
	pathPtr, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return err
	}
	// FILE_ATTRIBUTE_NORMAL = 128
	return syscall.SetFileAttributes(pathPtr, 128)
}

func protectDir(path string) error {
	pathPtr, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return err
	}
	// FILE_ATTRIBUTE_HIDDEN = 2, FILE_ATTRIBUTE_SYSTEM = 4
	return syscall.SetFileAttributes(pathPtr, 2|4)
}
