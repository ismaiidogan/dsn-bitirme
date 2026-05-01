//go:build !windows

package storage

import "syscall"

func diskFreeBytes(path string) int64 {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0
	}
	return int64(stat.Bavail) * int64(stat.Bsize)
}

func diskTotalBytes(path string) int64 {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0
	}
	return int64(stat.Blocks) * int64(stat.Bsize)
}

func protectFile(path string) error {
	// Set to read-only for the owner (0400)
	return os.Chmod(path, 0400)
}

func unprotectFile(path string) error {
	// Restore write permissions for the owner (0600) so it can be deleted
	return os.Chmod(path, 0600)
}

func protectDir(path string) error {
	// Read, write, execute for owner only (0700)
	return os.Chmod(path, 0700)
}
